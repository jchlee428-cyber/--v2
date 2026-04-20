import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import { GoogleGenAI, Type } from '@google/genai';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
import multer from 'multer';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini API (lazy initialization)
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

// Initialize Firebase Admin (lazy initialization)
let adminApp: admin.app.App | null = null;
function getFirebaseAdmin() {
  if (!adminApp) {
    // In a real production app, you'd use a service account key here.
    // For this demo environment, we'll try to initialize with default credentials
    // or skip if not available, since we can't easily inject a service account JSON.
    try {
      adminApp = admin.initializeApp();
    } catch (e) {
      console.error("Firebase Admin initialization failed:", e);
    }
  }
  return adminApp;
}

// Initialize Stripe (lazy initialization)
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Stripe webhook must use raw body parser
  app.post('/api/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.warn("STRIPE_WEBHOOK_SECRET not set, skipping webhook verification");
      return res.status(400).send('Webhook secret not configured');
    }

    let event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      const firebaseAdmin = getFirebaseAdmin();
      if (!firebaseAdmin) throw new Error("Firebase Admin not initialized");
      
      const db = firebaseAdmin.firestore();

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        
        if (userId) {
          await db.collection('users').doc(userId).update({
            isSubscribed: true,
            stripeCustomerId: session.customer,
            subscriptionId: session.subscription,
          });
          console.log(`User ${userId} subscribed successfully`);
        }
      } else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        // Find user by subscription ID and update
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('subscriptionId', '==', subscription.id).get();
        
        if (!snapshot.empty) {
          const userId = snapshot.docs[0].id;
          await usersRef.doc(userId).update({
            isSubscribed: false,
          });
          console.log(`User ${userId} subscription ended`);
        }
      }
    } catch (err) {
      console.error("Error processing webhook:", err);
    }

    res.json({received: true});
  });

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/user-status", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const stripe = getStripe();
      const customers = await stripe.customers.list({
        email: email as string,
        limit: 1
      });

      if (customers.data.length === 0) {
        return res.json({ isSubscribed: false });
      }

      const customer = customers.data[0];
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 1
      });

      res.json({ 
        isSubscribed: subscriptions.data.length > 0,
        customerId: customer.id
      });
    } catch (error: any) {
      console.error('Error fetching user status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const { userId, email } = req.body;
      const stripe = getStripe();
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer_email: email,
        client_reference_id: userId,
        line_items: [
          {
            price_data: {
              currency: 'krw',
              product_data: {
                name: '강해설교 분석기 PRO 구독',
                description: '무제한 설교 분석 및 PDF 다운로드',
              },
              unit_amount: 9900, // 9,900 KRW
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${process.env.APP_URL || 'http://localhost:3000'}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Stripe error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/create-portal-session", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const stripe = getStripe();
      const customers = await stripe.customers.list({
        email: email as string,
        limit: 1
      });
      
      if (customers.data.length === 0) {
        return res.status(404).json({ error: "No Stripe customer found" });
      }
      
      const customerId = customers.data[0].id;
      
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.APP_URL || 'http://localhost:3000'}`,
      });
      
      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Stripe portal error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/youtube-transcript", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });
      
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      const text = transcript.map(t => t.text).join(' ');
      res.json({ text });
    } catch (error: any) {
      console.error('YouTube transcript error:', error);
      res.status(400).json({ error: '유튜브 자막을 가져올 수 없습니다. 자막이 없는 영상이거나 잘못된 링크일 수 있습니다.' });
    }
  });

  app.post("/api/gdoc-text", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });
      
      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) throw new Error('유효한 구글 문서 링크가 아닙니다.');
      
      const id = match[1];
      const exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`;
      
      const response = await fetch(exportUrl);
      if (!response.ok) throw new Error('문서를 읽을 수 없습니다. 공유 설정이 "링크가 있는 모든 사용자"로 되어 있는지 확인해주세요.');
      
      const text = await response.text();
      res.json({ text });
    } catch (error: any) {
      console.error('Google Doc error:', error);
      res.status(400).json({ error: error.message || '구글 문서를 가져오는 중 오류가 발생했습니다.' });
    }
  });

  app.post("/api/extract-pdf", upload.single('file'), async (req, res) => {
    console.log("Extracting PDF using pdfjs-dist");
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      const pdf = await getDocument({
        data: new Uint8Array(req.file.buffer),
        cMapUrl: path.join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/'),
        cMapPacked: true,
        standardFontDataUrl: path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/')
      }).promise;
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
      }
      
      res.json({ text: fullText });
    } catch (error: any) {
      console.error('PDF extraction error:', error);
      res.status(500).json({ error: error.message || 'PDF 텍스트 추출 중 오류가 발생했습니다.' });
    }
  });

  app.post("/api/fetch-bible", async (req, res) => {
    try {
      const { biblePassage } = req.body;
      if (!biblePassage) return res.status(400).json({ error: "biblePassage is required" });

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `다음 성경 구절의 텍스트를 3가지 한국어 번역본(개역개정, 새번역, 공동번역)으로 정확하게 제공해주세요.\n\n구절: ${biblePassage.trim()}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                version: { type: Type.STRING },
                text: { type: Type.STRING }
              },
              required: ["version", "text"]
            }
          }
        }
      });
      
      const jsonStr = response.text || '[]';
      const parsed = JSON.parse(jsonStr);
      res.json(parsed);
    } catch (error: any) {
      console.error('Error fetching bible:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/analyze-sermon", async (req, res) => {
    try {
      const { prompt, systemInstruction, responseSchema } = req.body;
      if (!prompt) return res.status(400).json({ error: "prompt is required" });

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema
        }
      });

      const jsonStr = response.text;
      if (!jsonStr) throw new Error("No response from AI");
      
      const parsed = JSON.parse(jsonStr);
      res.json(parsed);
    } catch (error: any) {
      console.error('Error analyzing sermon:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen on a port if not running in Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

const expressApp = startServer();
export default expressApp;
