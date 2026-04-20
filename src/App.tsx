import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Send, AlertCircle, Loader2, CheckCircle2, XCircle, Copy, Check, Download, Clock, LayoutList, MessageSquare, Wand2, History, Upload, Trash2, X, FileText, BookMarked, Share2, ChevronDown, ChevronUp, LogIn, LogOut, User, Settings, Link as LinkIcon } from 'lucide-react';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, getDocFromServer } from 'firebase/firestore';
import { GoogleGenAI, Type } from '@google/genai';

// Set up PDF.js worker using Vite's worker import
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

interface HistoryItem {
  id: string;
  timestamp: number;
  metadata: { name: string; role?: string; date: string; passage: string; title?: string };
  sermonText: string;
  specificRequest: string;
  analysisResult: AnalysisData;
}

interface OutlineItem {
  point: string;
  details: string[];
}

interface ImprovementSuggestion {
  needed: boolean;
  original?: string;
  improved?: string;
  reason?: string;
}

interface AnalysisData {
  summary: string;
  outline: OutlineItem[];
  toneAnalysis: string;
  improvementSuggestion: ImprovementSuggestion;
  positivePoints: string[];
  criticalPoints: string[];
  detailedAnalysis: string;
}

export default function App() {
  const [sermonText, setSermonText] = useState('');
  const [sermonTitle, setSermonTitle] = useState('');
  const [preacherName, setPreacherName] = useState('');
  const [preacherRole, setPreacherRole] = useState('');
  const [sermonDate, setSermonDate] = useState('');
  const [biblePassage, setBiblePassage] = useState('');
  const [specificRequest, setSpecificRequest] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const [analyzedMetadata, setAnalyzedMetadata] = useState<{name: string, role?: string, date: string, passage: string, title?: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPrinciples, setShowPrinciples] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isFetchingBible, setIsFetchingBible] = useState(false);

  const [bibleTranslations, setBibleTranslations] = useState<{version: string, text: string}[] | null>(null);
  const [showBibleModal, setShowBibleModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{message: string, onConfirm: () => void} | null>(null);
  
  // Auth & Subscription State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
      userId: string | undefined;
      email: string | null | undefined;
      emailVerified: boolean | undefined;
      isAnonymous: boolean | undefined;
      tenantId: string | null | undefined;
      providerInfo: {
        providerId: string;
        displayName: string | null;
        email: string | null;
        photoUrl: string | null;
      }[];
    }
  }

  function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    }
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Check if user document exists, if not create it
        const userRef = doc(db, 'users', user.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            try {
              await setDoc(userRef, {
                uid: user.uid,
                email: user.email,
                isSubscribed: false,
                createdAt: new Date().toISOString()
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        }
      } else {
        setIsSubscribed(false);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser || !isAuthReady) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/user-status?email=${encodeURIComponent(currentUser.email || '')}`);
        const data = await res.json();
        setIsSubscribed(data.isSubscribed === true);
      } catch (err) {
        console.error("Failed to check subscription status", err);
      }
    };

    checkStatus();
    // Check every 30 seconds while active
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [currentUser, isAuthReady]);

  useEffect(() => {
    // Check if returning from Stripe checkout
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    if (sessionId && currentUser) {
      // Force a refresh of the user document to get the latest subscription status
      const checkSubscription = async () => {
        try {
          // Poll a few times since webhook might take a second
          for (let i = 0; i < 5; i++) {
            const res = await fetch(`/api/user-status?email=${encodeURIComponent(currentUser.email || '')}`);
            const data = await res.json();
            if (data.isSubscribed) {
              setIsSubscribed(true);
              setAlertMessage('결제가 성공적으로 완료되었습니다! 이제 PRO 기능을 사용하실 수 있습니다.');
              window.history.replaceState({}, document.title, window.location.pathname);
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error("Error checking subscription status:", error);
        }
      };
      
      checkSubscription();
    }
  }, [currentUser]);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
    
    const saved = localStorage.getItem('sermon_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setError('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let extractedText = '';

      if (ext === 'txt') {
        extractedText = await file.text();
      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else if (ext === 'pdf') {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/extract-pdf', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to extract PDF');
        }
        
        const data = await response.json();
        extractedText = data.text;
      } else {
        setError('지원하지 않는 파일 형식입니다. (.txt, .docx, .pdf 만 지원)');
        setIsExtracting(false);
        return;
      }

      setSermonText(extractedText);
    } catch (err) {
      console.error('File extraction error:', err);
      setError('파일에서 텍스트를 추출하는 중 오류가 발생했습니다.');
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFetchBible = async () => {
    if (!biblePassage.trim()) {
      setAlertMessage('본문 구절을 먼저 입력해주세요. (예: 요한복음 3:16)');
      return;
    }
    
    setIsFetchingBible(true);
    setShowBibleModal(true);
    setBibleTranslations(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
      setBibleTranslations(parsed);
    } catch (err) {
      console.error('Failed to fetch bible translations:', err);
      setAlertMessage('성경 구절을 불러오는 중 오류가 발생했습니다.');
      setShowBibleModal(false);
    } finally {
      setIsFetchingBible(false);
    }
  };

  const fallbackCopyToClipboard = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      
      // Avoid scrolling to bottom
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('Fallback copy failed', err);
      return false;
    }
  };

  const copyTextToClipboard = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('Clipboard API failed, falling back to execCommand', err);
      }
    }
    return fallbackCopyToClipboard(text);
  };

  const cleanReasonText = (text?: string) => {
    if (!text) return '';
    return text
      .replace(/\[시스템 메시지:.*?\]/g, '')
      .replace(/\(참고:.*?\)/g, '')
      .replace(/\(실제 JSON.*?\)/g, '')
      .replace(/\(불필요한 공백.*?\)/g, '')
      .replace(/\(개선안의 내용은.*?\)/g, '')
      .replace(/\(이 개선안이.*?\)/g, '')
      .replace(/\(개선안 끝\)/g, '')
      .replace(/\(수정 전 원문과.*?\)/g, '')
      .replace(/\(감사합니다\.\)/g, '')
      .replace(/\(끝\)/g, '')
      .replace(/\[종료\]/g, '')
      .replace(/\(이하 생략\)/g, '')
      .replace(/\(수정안 텍스트만 제공합니다\.\)/g, '')
      .replace(/\(이상입니다\.\)/g, '')
      .replace(/\(진짜 끝\)/g, '')
      .replace(/\(JSON 포맷 유지\)/g, '')
      .replace(/\(수정 이유:.*?\)/g, '')
      .replace(/\(수정안 본문:.*?\)/g, '')
      .replace(/\(원문:.*?\)/g, '')
      .replace(/\(필요 여부:.*?\)/g, '')
      .replace(/\(완료\)/g, '')
      .replace(/\(진짜 종료\)/g, '')
      .replace(/\(JSON\)/g, '')
      .replace(/\(수정안 텍스트\)/g, '')
      .replace(/\[수정 이유 요약\]/g, '\n\n**[수정 이유 요약]**\n')
      .replace(/\[수정 방향\]/g, '\n\n**[수정 방향]**\n')
      .replace(/\[수정안\]/g, '\n\n**[수정안]**\n')
      .replace(/\[기대 효과\]/g, '\n\n**[기대 효과]**\n')
      .replace(/\[참고 자료\]/g, '\n\n**[참고 자료]**\n')
      .replace(/\[추가 조언\]/g, '\n\n**[추가 조언]**\n')
      .replace(/\[평가자 코멘트\]/g, '\n\n**[평가자 코멘트]**\n')
      .replace(/\[종합 평가\]/g, '\n\n**[종합 평가]**\n')
      .replace(/\[비고\]/g, '\n\n**[비고]**\n')
      .replace(/\[참고사항\]/g, '\n\n**[참고사항]**\n')
      .replace(/\[마무리\]/g, '\n\n**[마무리]**\n')
      .replace(/\[끝\]/g, '')
      .trim();
  };

  const handleCopy = async () => {
    if (!analysisResult) return;
    
    let metaText = '';
    if (analyzedMetadata?.title || analyzedMetadata?.name || analyzedMetadata?.date || analyzedMetadata?.passage) {
      metaText = '\n\n**[설교 정보]**\n';
      if (analyzedMetadata.title) metaText += `- 설교 제목: ${analyzedMetadata.title}\n`;
      if (analyzedMetadata.name) {
        metaText += `- 설교자: ${analyzedMetadata.name}`;
        if (analyzedMetadata.role) metaText += ` ${analyzedMetadata.role}`;
        metaText += '\n';
      }
      if (analyzedMetadata.date) metaText += `- 날짜: ${analyzedMetadata.date}\n`;
      if (analyzedMetadata.passage) metaText += `- 본문: ${analyzedMetadata.passage}\n`;
    }
    
    let outlineText = analysisResult.outline.map(item => {
      let text = `### ${item.point}\n`;
      item.details.forEach(d => text += `- ${d}\n`);
      return text.trim();
    }).join('\n\n');

    let toneText = `## 어휘 및 어조 분석\n${analysisResult.toneAnalysis}\n\n`;
    
    let improvementText = '';
    if (analysisResult.improvementSuggestion?.needed) {
      improvementText = `## 💡 이렇게 고쳐보세요 (대안 및 개선 제안)\n**수정 이유:**\n${cleanReasonText(analysisResult.improvementSuggestion.reason)}\n\n**[수정 전]**\n${analysisResult.improvementSuggestion.original}\n\n**[수정 후]**\n${analysisResult.improvementSuggestion.improved}\n\n`;
    }

    const textToCopy = `
# 강해설교 분석 결과${metaText}

## 설교 핵심 요약
${analysisResult.summary}

## 설교 개요 (Outline)
${outlineText}

${toneText}${improvementText}## 긍정적인 부분
${analysisResult.positivePoints.length > 0 ? analysisResult.positivePoints.map(p => `- ${p}`).join('\n') : '- 해당 사항 없음'}

## 비판적인 부분
${analysisResult.criticalPoints.length > 0 ? analysisResult.criticalPoints.map(p => `- ${p}`).join('\n') : '- 해당 사항 없음'}

## 상세 분석 및 평가
${analysisResult.detailedAnalysis.replace(/\\n/g, '\n').replace(/WnWn/g, '\n\n')}
    `.trim();

    const success = await copyTextToClipboard(textToCopy);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      setAlertMessage('복사에 실패했습니다. 브라우저 설정에서 클립보드 접근을 허용해주세요.');
    }
  };

  const handleShareSummary = async () => {
    if (!analysisResult) return;

    let preacherText = analyzedMetadata?.name || '설교자 미상';
    if (analyzedMetadata?.name && analyzedMetadata?.role) {
      preacherText = `${analyzedMetadata.name} ${analyzedMetadata.role}`;
    } else if (analyzedMetadata?.name) {
      preacherText = `${analyzedMetadata.name} 목사님`;
    }

    const summaryText = `
[강해설교 분석 요약] ${analyzedMetadata?.title ? `"${analyzedMetadata.title}" - ` : ''}${preacherText}
본문: ${analyzedMetadata?.passage || '미상'}

📌 핵심 요약:
${analysisResult.summary}

✅ 긍정적인 부분:
${analysisResult.positivePoints.map(p => `- ${p}`).join('\n')}

⚠️ 개선이 필요한 부분:
${analysisResult.criticalPoints.map(p => `- ${p}`).join('\n')}

자세한 분석 결과는 앱에서 확인하세요!
${window.location.href}
`.trim();

    try {
      if (navigator.share) {
        await navigator.share({
          title: '강해설교 분석 요약',
          text: summaryText,
        });
      } else {
        const success = await copyTextToClipboard(summaryText);
        if (success) {
          setAlertMessage('요약 내용이 클립보드에 복사되었습니다. 원하는 곳에 붙여넣기 하여 공유하세요.');
        } else {
          setAlertMessage('공유하기를 지원하지 않는 환경이며, 클립보드 복사에도 실패했습니다.');
        }
      }
    } catch (error: any) {
      console.error('Error sharing:', error);
      if (error.name !== 'AbortError') {
        const success = await copyTextToClipboard(summaryText);
        if (success) {
          setAlertMessage('요약 내용이 클립보드에 복사되었습니다. 원하는 곳에 붙여넣기 하여 공유하세요.');
        } else {
          setAlertMessage('공유하기를 지원하지 않는 환경이며, 클립보드 복사에도 실패했습니다.');
        }
      }
    }
  };

  const handleDownloadPdf = async () => {
    if (!resultRef.current) return;
    
    setIsDownloadingPdf(true);
    try {
      const element = resultRef.current;
      
      // Construct filename
      let filename = '강해설교_분석결과.pdf';
      const parts = [];
      if (analyzedMetadata?.date) parts.push(analyzedMetadata.date);
      if (analyzedMetadata?.name) parts.push(analyzedMetadata.name);
      if (parts.length > 0) {
        filename = `${parts.join('_')}_분석결과.pdf`;
      }

      // Temporarily adjust styles for better PDF output
      const originalStyle = element.style.cssText;
      element.style.fontSize = '15px';
      element.style.lineHeight = '1.8';
      element.style.color = '#1c1917'; // text-stone-900

      const opt = {
        margin:       [15, 15, 15, 15] as [number, number, number, number],
        filename:     filename,
        image:        { type: 'jpeg' as const, quality: 1 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak:    { mode: ['css', 'legacy'], avoid: ['p', 'h1', 'h2', 'h3', 'h4', 'li', '.rounded-xl', '.rounded-lg', 'strong', 'span'] }
      };
      
      // Dynamically import html2pdf to avoid Vite bundling issues
      const html2pdfModule = await import('html2pdf.js');
      const generatePdf = (html2pdfModule.default || html2pdfModule) as any;
      
      await generatePdf().set(opt).from(element).save();

      // Restore original styles
      element.style.cssText = originalStyle;
    } catch (err: any) {
      console.error('Failed to generate PDF: ', err);
      setAlertMessage(`PDF 생성에 실패했습니다: ${err.message || String(err)}`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleSubscribe = async () => {
    if (!currentUser) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.uid,
          email: currentUser.email,
        }),
      });
      
      const data = await response.json();
      if (data.url) {
        // iframe 내부에서 실행 중인지 확인
        if (window.self !== window.top) {
          // iframe 내부라면 새 창으로 열기 (팝업 차단 우회)
          const newWindow = window.open(data.url, '_blank');
          if (!newWindow) {
            setAlertMessage('팝업이 차단되었습니다. 팝업 차단을 해제하거나, 우측 상단의 "새 탭에서 열기" 버튼을 눌러 앱을 새 창에서 실행한 후 다시 시도해주세요.');
          } else {
            setAlertMessage('새 창에서 결제 페이지가 열렸습니다. 결제가 완료되면 이 창을 새로고침 해주세요.');
          }
        } else {
          // 독립된 창이라면 바로 이동
          window.location.href = data.url;
        }
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      setAlertMessage(`결제 페이지로 이동하는 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!currentUser) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: currentUser.email,
        }),
      });
      
      const data = await response.json();
      if (data.url) {
        if (window.self !== window.top) {
          window.open(data.url, '_blank');
        } else {
          window.location.href = data.url;
        }
      } else {
        throw new Error(data.error || 'Failed to create portal session');
      }
    } catch (error: any) {
      console.error('Portal error:', error);
      setAlertMessage(`구독 관리 페이지로 이동하는 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/popup-blocked') {
        setAlertMessage("팝업이 차단되었습니다. 주소창 우측에서 팝업 차단을 해제해주세요.");
      } else if (error.code === 'auth/unauthorized-domain') {
        setAlertMessage("승인되지 않은 도메인입니다. 파이어베이스 인증 설정에서 현재 주소(v2-rust-five.vercel.app)가 '승인된 도메인(Authorized domains)'에 추가되어 있는지 다시 한 번 확인해주세요.");
      } else {
        setAlertMessage(`로그인 중 오류가 발생했습니다: ${error.message} (에러 코드: ${error.code})`);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!currentUser) {
      handleLogin();
      return;
    }

    if (!isSubscribed) {
      handleSubscribe();
      return;
    }

    if (!sermonText.trim()) {
      setError('설교 전문을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');
    setAnalysisResult(null);
    setAnalyzedMetadata({ 
      name: preacherName.trim(), 
      role: preacherRole.trim(),
      date: sermonDate, 
      passage: biblePassage.trim(),
      title: sermonTitle.trim()
    });

    try {
      let prompt = '';
      if (sermonTitle.trim()) prompt += `설교 제목: ${sermonTitle.trim()}\n`;
      prompt += `설교자: ${preacherName.trim()} ${preacherRole.trim()}\n`;
      prompt += `설교 일자: ${sermonDate}\n`;
      prompt += `본문: ${biblePassage}\n`;
      prompt += `사용자 요청사항: ${specificRequest}\n\n`;
      prompt += `[설교 전문]\n${sermonText}\n`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: `당신은 기독교 강해설교 분야, 특히 존 맥아더(John MacArthur) 목사님의 강해설교 원리와 개혁주의 신학에 대한 심층적인 지식을 갖춘 최고 수준의 설교 분석 전문가입니다. 
당신은 수많은 정통 신학 서적(예: 마틴 로이드 존스의 '설교와 설교자', 존 스토트의 '두 세계 사이에서', 존 맥아더의 '강해설교 재발견' 등)과 강해설교 방법론을 깊이 학습한 상태입니다.
제공된 설교 텍스트를 다음의 '존 맥아더 신학 마스터 클래스: 강해설교' 핵심 7가지 원칙과 성경 해석학적 방법론에 기반하여 매우 엄격하고 심층적으로 분석하고 평가하십시오.

[신학적 전제 및 해석학적 방법론 (Theological & Hermeneutical Framework)]
- 주해(Exegesis) vs 주입(Eisegesis): 설교자가 본문에서 의미를 이끌어내는가(Exegesis), 아니면 자신의 생각을 본문에 주입하는가(Eisegesis)?
- 문법적-역사적 해석(Grammatical-Historical Method): 본문의 역사적 배경과 문법적 구조를 바르게 파악하고 있는가?
- 저자의 의도(Authorial Intent): 성령의 영감을 받은 원저자의 의도를 정확히 파악하고 전달하는가?
- 오직 성경(Sola Scriptura): 성경만이 최종 권위임을 인정하고, 인간의 철학이나 심리학, 세속적 지혜에 의존하지 않는가?

[강해설교 7가지 핵심 평가 기준]
1. 본문의 의미 설명 (Text-driven): 성경 본문의 원래 의미를 설명하고 있는가? ("나에게 무엇을 의미하냐"가 아닌 "하나님께 무엇을 의미하느냐"에 초점을 맞추었는가?)
2. 하나님의 권위 (God's authority): 본문을 충실히 설명하여 하나님의 권위를 드러내고 있는가, 아니면 설교자의 생각이나 철학으로 대체하였는가?
3. 설교자의 태도 (Preacher's attitude): 자기 이야기나 개인 경험 중심이 아닌가? (설교자가 주인공이 되는 교만을 경계하고 철저히 메신저로 숨어있는가?)
4. 그리스도의 주되심 (Christ's Lordship): 교회의 머리이신 그리스도의 음성이 선포되고 그리스도를 높이고 있는가?
5. 성령의 역사 (Holy Spirit's work): 감정 자극이나 사람의 반응을 유도하는 인위적인 방식을 취하지 않고, 오직 말씀을 통한 성령의 역사를 의지하는가?
6. 적용의 주체 (Subject of application): 설교자가 무리하게 구체적인 행동 지침을 강요하지 않고, 성경적 원리를 명확히 제시하여 성령께서 각 성도의 삶에 적용하시도록 돕고 있는가?
7. 예화 사용 (Use of illustrations): 개인 이야기 중심의 얄팍한 예화를 피하고, 성경으로 성경을 설명하거나 성경적(구약 등) 사건, 혹은 교회사적 사실을 예화로 활용하고 있는가?

[분석 지침 - 매우 중요]
- 상세 분석(detailedAnalysis) 작성 시, 위 7가지 원칙 각각에 대해 설교가 얼마나 잘 따르고 있는지 개별적으로 상세히 평가하십시오.
- 반드시 설교 텍스트의 특정 구절이나 문장을 직접 인용("...")하여 평가의 구체적인 근거로 제시하십시오. (예: "설교의 '...'라는 부분은 본문의 역사적 배경을 무시한 Eisegesis의 전형입니다.")
- 비판적인 부분(criticalPoints)을 지적할 때는, 해당 부분이 위 7가지 원칙 중 정확히 어떤 원칙을 위배했는지 명시적으로 연결하여 설명하십시오. (예: "[원칙 3 위배] 설교자의 개인적인 경험담이 너무 길게 제시됨")
- 어휘 및 어조, 대안 제안 등도 함께 종합하여 분석하십시오.
- 위 기준들을 바탕으로 설교가 성경 본문에 충실한지, 교리적으로 건전한지, 복음(그리스도)이 명확하게 선포되었는지 객관적이고 건설적으로 평가하되, 본문에서 벗어난 부분은 단호하게 비판하십시오.
- 사용자가 특정 질문이나 초점을 제공한 경우, 해당 부분을 우선적으로 분석하십시오.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: "강해설교 원칙에 비추어 본 설교 핵심 요약" },
              outline: { 
                type: Type.ARRAY, 
                description: "설교의 논리적 흐름에 따른 개요(서론, 본론 대지, 결론 등)",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    point: { type: Type.STRING, description: "대지 제목 (예: 서론, 1. 첫 번째 대지, 결론 등)" },
                    details: { type: Type.ARRAY, items: { type: Type.STRING }, description: "해당 대지의 핵심 내용 요약" }
                  },
                  required: ["point", "details"]
                }
              },
              toneAnalysis: { type: Type.STRING, description: "어휘 및 어조 분석 (너무 어려운 신학 용어 남발, 혹은 너무 가벼운 유머 위주의 어조인지 평가)" },
              improvementSuggestion: {
                type: Type.OBJECT,
                description: "본문에서 벗어났거나 인간 중심적으로 흐른 문단을 성경 중심적으로 다시 쓴 모범 수정안",
                properties: {
                  needed: { type: Type.BOOLEAN, description: "수정이 필요한 문단이 있는지 여부" },
                  original: { type: Type.STRING, description: "원문 문단 (수정이 필요한 부분)" },
                  improved: { type: Type.STRING, description: "성경 중심적으로 개선된 모범 수정안" },
                  reason: { type: Type.STRING, description: "수정 이유 (반드시 1~2문장으로 아주 간결하게 핵심만 작성할 것. 시스템 메시지, 부연 설명, 괄호 코멘트 등을 절대 포함하지 말 것)" }
                },
                required: ["needed"]
              },
              positivePoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "강해설교 원칙에 부합하는 긍정적인 평가 부분들 (명확하고 간결한 문장으로 작성)" },
              criticalPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "강해설교 원칙에 어긋나거나 개선이 필요한 비판적인 평가 부분들. 어떤 원칙을 위배했는지 명시적으로 포함하여 작성 (예: '[원칙 7 위배] 개인적인 예화가 너무 긺')" },
              detailedAnalysis: { type: Type.STRING, description: "7가지 핵심 원칙 각각에 대한 심층적이고 상세한 분석 및 평가. 반드시 설교 본문의 특정 구절을 직접 인용하여 근거로 제시할 것 (마크다운 포맷)" }
            },
            required: ["summary", "outline", "toneAnalysis", "improvementSuggestion", "positivePoints", "criticalPoints", "detailedAnalysis"]
          }
        }
      });
      
      const jsonStr = response.text;
      if (!jsonStr) throw new Error("No response from AI");
      
      const parsed = JSON.parse(jsonStr) as AnalysisData;
      setAnalysisResult(parsed);

      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        metadata: { name: preacherName.trim(), date: sermonDate, passage: biblePassage.trim() },
        sermonText,
        specificRequest,
        analysisResult: parsed
      };
      setHistory(prev => {
        const updated = [newHistoryItem, ...prev].slice(0, 50);
        localStorage.setItem('sermon_history', JSON.stringify(updated));
        return updated;
      });

    } catch (err: any) {
      console.error('Error analyzing sermon:', err);
      setError(err.message || '분석 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-gray-900 font-sans selection:bg-stone-300">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-stone-800 text-white p-2 rounded-lg">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 whitespace-nowrap">
                강해설교 분석<span className="hidden sm:inline">기</span>
              </h1>
              <p className="hidden sm:block text-xs text-stone-500 font-medium mt-0.5">존 맥아더 목사님의 성경적 설교 원리 기반</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {currentUser ? (
              <div className="flex items-center gap-1 sm:gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-medium text-stone-900">{currentUser.displayName || currentUser.email}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSubscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-600'}`}>
                    {isSubscribed ? 'PRO 구독 중' : '무료 계정'}
                  </span>
                </div>
                <button
                  onClick={() => setShowAccountSettings(true)}
                  className="flex items-center justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                  title="계정 설정"
                >
                  <Settings className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">설정</span>
                </button>
                <button
                  onClick={() => signOut(auth)}
                  className="flex items-center justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                  title="로그아웃"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-1 sm:gap-2 px-2 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-md sm:rounded-lg transition-colors whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>로그인</span>
              </button>
            )}
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">분석 기록</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Input Section */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-stone-100 rounded-2xl overflow-hidden border border-stone-200">
              <button 
                onClick={() => setShowPrinciples(!showPrinciples)}
                className="w-full px-6 py-4 flex items-center justify-between bg-stone-100 hover:bg-stone-200 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-stone-600" />
                  <h3 className="font-semibold text-stone-800">존 맥아더 강해설교 마스터 클래스 핵심 기준</h3>
                </div>
                {showPrinciples ? <ChevronUp className="w-5 h-5 text-stone-500" /> : <ChevronDown className="w-5 h-5 text-stone-500" />}
              </button>
              
              {showPrinciples && (
                <div className="px-6 pb-6 pt-2 text-sm text-stone-600 animate-in slide-in-from-top-2 duration-200">
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>본문 중심:</strong> "나에게"가 아닌 "하나님께" 무엇을 의미하는가?</li>
                    <li><strong>하나님의 권위:</strong> 본문을 설명하지 않으면 하나님의 권위를 박탈하는 것</li>
                    <li><strong>설교자의 태도:</strong> 자기 경험, 이야기 중심은 교만이며 경계 대상</li>
                    <li><strong>그리스도의 주되심:</strong> 오직 성경을 통해 그리스도의 음성을 전달</li>
                    <li><strong>성령의 역사:</strong> 감정 자극이 아닌 말씀을 통한 성령의 역사 의지</li>
                    <li><strong>적용의 주체:</strong> 설교자는 원리를 설명하고, 적용은 성령의 역할</li>
                    <li><strong>예화 사용:</strong> 개인 이야기 금지, 성경으로 성경을 설명</li>
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded text-sm">1</span>
                설교 입력
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="sermonTitle" className="block text-sm font-medium text-stone-700 mb-1">
                    설교 제목 (선택)
                  </label>
                  <input
                    id="sermonTitle"
                    type="text"
                    className="w-full rounded-xl border-stone-300 shadow-sm focus:border-stone-500 focus:ring-stone-500 bg-stone-50 p-3 text-sm"
                    placeholder="예: 산상수훈 강해 1 - 팔복"
                    value={sermonTitle}
                    onChange={(e) => setSermonTitle(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 flex gap-2">
                    <div className="flex-grow">
                      <label htmlFor="preacherName" className="block text-sm font-medium text-stone-700 mb-1">
                        설교자 (선택)
                      </label>
                      <input
                        id="preacherName"
                        type="text"
                        className="w-full rounded-xl border-stone-300 shadow-sm focus:border-stone-500 focus:ring-stone-500 bg-stone-50 p-3 text-sm"
                        placeholder="예: 홍길동"
                        value={preacherName}
                        onChange={(e) => setPreacherName(e.target.value)}
                      />
                    </div>
                    <div className="w-28 shrink-0">
                      <label htmlFor="preacherRole" className="block text-sm font-medium text-stone-700 mb-1">
                        직책
                      </label>
                      <select
                        id="preacherRole"
                        className="w-full rounded-xl border-stone-300 shadow-sm focus:border-stone-500 focus:ring-stone-500 bg-stone-50 p-3 text-sm"
                        value={preacherRole}
                        onChange={(e) => setPreacherRole(e.target.value)}
                      >
                        <option value="">선택</option>
                        <option value="목사">목사</option>
                        <option value="강도사">강도사</option>
                        <option value="전도사">전도사</option>
                        <option value="선교사">선교사</option>
                        <option value="기타">기타</option>
                      </select>
                    </div>
                  </div>
                  <div className="sm:col-span-1">
                    <label htmlFor="sermonDate" className="block text-sm font-medium text-stone-700 mb-1 whitespace-nowrap">
                      설교 날짜 (선택)
                    </label>
                    <input
                      id="sermonDate"
                      type="date"
                      className="w-full rounded-xl border-stone-300 shadow-sm focus:border-stone-500 focus:ring-stone-500 bg-stone-50 p-3 text-sm"
                      value={sermonDate}
                      onChange={(e) => setSermonDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-end mb-1">
                    <label htmlFor="biblePassage" className="block text-sm font-medium text-stone-700">
                      본문 말씀 (선택)
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchBible}
                      disabled={!biblePassage.trim() || isFetchingBible}
                      className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                    >
                      <BookMarked className="w-3.5 h-3.5" />
                      번역본 비교
                    </button>
                  </div>
                  <input
                    id="biblePassage"
                    type="text"
                    className="w-full rounded-xl border-stone-300 shadow-sm focus:border-stone-500 focus:ring-stone-500 bg-stone-50 p-3 text-sm"
                    placeholder="예: 요한복음 3:16"
                    value={biblePassage}
                    onChange={(e) => setBiblePassage(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2 mb-2">
                    <label htmlFor="sermonText" className="block text-sm font-medium text-stone-700">
                      설교 전문 (필수)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".txt,.docx,.pdf" 
                        className="hidden" 
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isExtracting}
                        className="flex items-center gap-1.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                      >
                        {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {isExtracting ? '추출 중...' : '파일 업로드 (.txt, .docx, .pdf)'}
                      </button>
                      {sermonText.trim().length > 0 && (
                        <div className="flex items-center gap-3 text-xs text-stone-500 font-medium bg-stone-100 px-2.5 py-1.5 rounded-md">
                          <span>공백 제외 {sermonText.replace(/\s/g, '').length.toLocaleString()}자</span>
                          <span className="w-px h-3 bg-stone-300"></span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            예상 소요 시간: 약 {Math.max(1, Math.ceil(sermonText.replace(/\s/g, '').length / 300))}분
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <textarea
                    id="sermonText"
                    rows={12}
                    className="w-full rounded-xl border-stone-300 shadow-sm focus:border-stone-500 focus:ring-stone-500 bg-stone-50 p-3 text-sm resize-none"
                    placeholder="분석할 설교의 텍스트를 이곳에 붙여넣으세요..."
                    value={sermonText}
                    onChange={(e) => setSermonText(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="specificRequest" className="block text-sm font-medium text-stone-700 mb-1">
                    추가 요청사항 (선택)
                  </label>
                  <textarea
                    id="specificRequest"
                    rows={3}
                    className="w-full rounded-xl border-stone-300 shadow-sm focus:border-stone-500 focus:ring-stone-500 bg-stone-50 p-3 text-sm resize-none"
                    placeholder="예: 이 설교는 본문을 무시하고 예화만 너무 많은 것 같은데, 존 맥아더의 '기소장' 관점에서 비판해줘."
                    value={specificRequest}
                    onChange={(e) => setSpecificRequest(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <button
                  onClick={handleAnalyze}
                  disabled={isLoading}
                  className="w-full bg-stone-900 text-white rounded-xl py-3 px-4 font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      분석 중...
                    </>
                  ) : !currentUser ? (
                    <>
                      <LogIn className="w-5 h-5" />
                      로그인 후 분석하기
                    </>
                  ) : !isSubscribed ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      PRO 구독하고 분석하기
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      분석 시작하기
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Output Section */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 min-h-[600px] flex flex-col">
              <div className="flex items-center justify-between mb-6 border-b border-stone-100 pb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded text-sm">2</span>
                  분석 결과
                </h2>
                
                {analysisResult && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleShareSummary}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                      요약 공유
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      {isCopied ? '복사됨' : '복사'}
                    </button>
                    <button
                      onClick={handleDownloadPdf}
                      disabled={isDownloadingPdf}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors disabled:opacity-70"
                    >
                      {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      PDF 다운로드
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex-grow overflow-auto">
                {isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-stone-400 space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-stone-300" />
                    <p className="text-sm">설교를 꼼꼼히 분석하고 있습니다...</p>
                  </div>
                ) : analysisResult ? (
                  <div ref={resultRef} className="space-y-8 animate-in fade-in duration-500 p-2">
                    {/* Metadata Header */}
                    {(analyzedMetadata?.title || analyzedMetadata?.name || analyzedMetadata?.date || analyzedMetadata?.passage) && (
                      <div className="flex flex-wrap gap-6 pb-2 border-b border-stone-100 text-sm">
                        {analyzedMetadata.title && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-500">설교 제목:</span>
                            <span className="text-stone-800 font-medium">{analyzedMetadata.title}</span>
                          </div>
                        )}
                        {analyzedMetadata.name && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-500">설교자:</span>
                            <span className="text-stone-800 font-medium">
                              {analyzedMetadata.name} {analyzedMetadata.role && <span className="text-stone-600 text-xs ml-1">{analyzedMetadata.role}</span>}
                            </span>
                          </div>
                        )}
                        {analyzedMetadata.date && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-500">설교 날짜:</span>
                            <span className="text-stone-800 font-medium">{analyzedMetadata.date}</span>
                          </div>
                        )}
                        {analyzedMetadata.passage && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-500">본문 말씀:</span>
                            <span className="text-stone-800 font-medium">{analyzedMetadata.passage}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Summary */}
                    <div className="bg-stone-50 p-6 rounded-xl border border-stone-200">
                      <h3 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-stone-600" />
                        설교 핵심 요약
                      </h3>
                      <p className="text-stone-700 leading-relaxed">{analysisResult.summary}</p>
                    </div>

                    {/* Outline */}
                    <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
                      <h3 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2 border-b border-stone-100 pb-3">
                        <LayoutList className="w-5 h-5 text-stone-600" />
                        설교 개요 (Outline)
                      </h3>
                      <div className="space-y-5">
                        {analysisResult.outline.map((item, idx) => (
                          <div key={idx} className="pl-3 border-l-2 border-stone-300">
                            <h4 className="font-semibold text-stone-800">{item.point}</h4>
                            {item.details.length > 0 && (
                              <ul className="mt-2 space-y-1.5">
                                {item.details.map((detail, dIdx) => (
                                  <li key={dIdx} className="text-sm text-stone-600 flex items-start gap-2">
                                    <span className="text-stone-400 mt-0.5">-</span>
                                    <span className="leading-relaxed">{detail}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tone Analysis */}
                    <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-200">
                      <h3 className="text-lg font-bold text-indigo-800 mb-3 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-indigo-600" />
                        어휘 및 어조 분석
                      </h3>
                      <p className="text-indigo-900 leading-relaxed text-sm">{analysisResult.toneAnalysis}</p>
                    </div>

                    {/* Improvement Suggestion */}
                    {analysisResult.improvementSuggestion?.needed && (
                      <div className="bg-amber-50 p-6 rounded-xl border border-amber-200">
                        <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2 border-b border-amber-200 pb-3">
                          <Wand2 className="w-5 h-5 text-amber-600" />
                          이렇게 고쳐보세요 (대안 및 개선 제안)
                        </h3>
                        <div className="text-sm text-amber-800 mb-4 bg-amber-100 p-4 rounded-lg prose prose-amber max-w-none prose-p:leading-relaxed prose-strong:text-amber-900">
                          <strong className="font-semibold block mb-2 text-base">수정 이유:</strong>
                          <ReactMarkdown>
                            {cleanReasonText(analysisResult.improvementSuggestion.reason)}
                          </ReactMarkdown>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white p-4 rounded-lg border border-stone-200 shadow-sm">
                            <div className="text-xs font-bold text-stone-400 mb-2 uppercase tracking-wider">수정 전 (Original)</div>
                            <p className="text-stone-500 text-sm leading-relaxed">{analysisResult.improvementSuggestion.original}</p>
                          </div>
                          <div className="bg-white p-4 rounded-lg border border-emerald-200 shadow-sm ring-1 ring-emerald-100">
                            <div className="text-xs font-bold text-emerald-600 mb-2 uppercase tracking-wider">수정 후 (Improved)</div>
                            <p className="text-stone-800 text-sm leading-relaxed">{analysisResult.improvementSuggestion.improved}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Positive & Critical Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-200">
                        <h3 className="text-emerald-800 font-bold mb-4 flex items-center gap-2 border-b border-emerald-200 pb-2">
                          <CheckCircle2 className="w-5 h-5" /> 긍정적인 부분
                        </h3>
                        <ul className="space-y-3">
                          {analysisResult.positivePoints.map((pt, i) => (
                            <li key={i} className="text-emerald-800 text-sm flex items-start gap-2 leading-relaxed">
                              <span className="mt-0.5 text-emerald-500">•</span>
                              <span>{pt}</span>
                            </li>
                          ))}
                          {analysisResult.positivePoints.length === 0 && (
                            <li className="text-emerald-600 text-sm italic">해당 사항 없음</li>
                          )}
                        </ul>
                      </div>

                      <div className="bg-rose-50 p-5 rounded-xl border border-rose-200">
                        <h3 className="text-rose-800 font-bold mb-4 flex items-center gap-2 border-b border-rose-200 pb-2">
                          <XCircle className="w-5 h-5" /> 비판적인 부분
                        </h3>
                        <ul className="space-y-3">
                          {analysisResult.criticalPoints.map((pt, i) => (
                            <li key={i} className="text-rose-800 text-sm flex items-start gap-2 leading-relaxed">
                              <span className="mt-0.5 text-rose-500">•</span>
                              <span>{pt}</span>
                            </li>
                          ))}
                          {analysisResult.criticalPoints.length === 0 && (
                            <li className="text-rose-600 text-sm italic">해당 사항 없음</li>
                          )}
                        </ul>
                      </div>
                    </div>

                    {/* Detailed Analysis */}
                    <div className="pt-4">
                      <h3 className="text-lg font-bold text-stone-800 mb-6 border-b border-stone-200 pb-3">
                        상세 분석 및 평가
                      </h3>
                      <div className="markdown-body prose prose-stone max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:leading-relaxed prose-li:marker:text-stone-400 prose-strong:text-stone-900 whitespace-pre-wrap">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult.detailedAnalysis.replace(/\\n/g, '\n').replace(/WnWn/g, '\n\n')}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-stone-400 space-y-4">
                    <BookOpen className="w-12 h-12 text-stone-200" />
                    <p className="text-sm text-center max-w-xs">
                      좌측에 설교 전문을 입력하고 분석을 시작하면<br/>이곳에 결과가 표시됩니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Bible Translations Modal */}
      {showBibleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-stone-100">
              <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-indigo-600" />
                {biblePassage} - 번역본 비교
              </h2>
              <button 
                onClick={() => setShowBibleModal(false)} 
                className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow bg-stone-50">
              {isFetchingBible ? (
                <div className="flex flex-col items-center justify-center py-12 text-stone-500">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
                  <p>여러 번역본을 조회하고 있습니다...</p>
                </div>
              ) : bibleTranslations ? (
                <div className="space-y-4">
                  {bibleTranslations.map((t, idx) => (
                    <div key={idx} className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm">
                      <h3 className="text-sm font-bold text-indigo-700 mb-2">{t.version}</h3>
                      <p className="text-stone-800 leading-relaxed">{t.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-red-500 py-8">
                  데이터를 불러오지 못했습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-stone-100">
              <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                <History className="w-5 h-5 text-stone-600" />
                이전 분석 기록
              </h2>
              <button 
                onClick={() => setShowHistoryModal(false)} 
                className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow bg-stone-50">
              {history.length === 0 ? (
                <div className="text-center text-stone-500 py-12 flex flex-col items-center">
                  <FileText className="w-12 h-12 text-stone-300 mb-4" />
                  <p className="font-medium text-stone-600">저장된 분석 기록이 없습니다.</p>
                  <p className="text-sm mt-1">새로운 설교를 분석하면 이곳에 자동으로 저장됩니다.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map(item => (
                    <div 
                      key={item.id} 
                      className="bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-400 hover:shadow-md transition-all flex justify-between items-start group cursor-pointer"
                      onClick={() => {
                        setSermonTitle(item.metadata.title || '');
                        setPreacherName(item.metadata.name);
                        setPreacherRole(item.metadata.role || '');
                        setSermonDate(item.metadata.date);
                        setBiblePassage(item.metadata.passage);
                        setSermonText(item.sermonText);
                        setSpecificRequest(item.specificRequest);
                        setAnalysisResult(item.analysisResult);
                        setAnalyzedMetadata(item.metadata);
                        setShowHistoryModal(false);
                      }}
                    >
                      <div className="flex-grow pr-4">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm font-bold text-stone-800 bg-stone-100 px-2.5 py-1 rounded-md">
                            {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                          {(item.metadata.title || item.metadata.name || item.metadata.passage) && (
                            <div className="text-sm text-stone-600 flex gap-3 font-medium items-center flex-wrap">
                              {item.metadata.title && <span className="text-stone-900 font-bold">{item.metadata.title}</span>}
                              {item.metadata.title && (item.metadata.name || item.metadata.passage) && <span className="text-stone-300">|</span>}
                              {item.metadata.name && <span>{item.metadata.name} {item.metadata.role && <span className="text-xs text-stone-400">{item.metadata.role}</span>}</span>}
                              {item.metadata.name && item.metadata.passage && <span className="text-stone-300">|</span>}
                              {item.metadata.passage && <span>{item.metadata.passage}</span>}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-stone-500 mt-2 line-clamp-2 leading-relaxed">
                          {item.sermonText}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDialog({
                            message: '이 기록을 삭제하시겠습니까?',
                            onConfirm: () => {
                              const newHistory = history.filter(h => h.id !== item.id);
                              setHistory(newHistory);
                              localStorage.setItem('sermon_history', JSON.stringify(newHistory));
                            }
                          });
                        }}
                        className="text-stone-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                        title="기록 삭제"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 p-6">
            <div className="flex items-center gap-3 mb-4 text-stone-800">
              <AlertCircle className="w-6 h-6 text-amber-500" />
              <h3 className="font-bold text-lg">알림</h3>
            </div>
            <p className="text-stone-600 mb-6">{alertMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setAlertMessage('')}
                className="px-4 py-2 bg-stone-800 text-white rounded-lg font-medium hover:bg-stone-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 p-6">
            <div className="flex items-center gap-3 mb-4 text-stone-800">
              <AlertCircle className="w-6 h-6 text-rose-500" />
              <h3 className="font-bold text-lg">확인</h3>
            </div>
            <p className="text-stone-600 mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-stone-100 text-stone-700 rounded-lg font-medium hover:bg-stone-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Settings Modal */}
      {showAccountSettings && currentUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-stone-100">
              <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                계정 설정
              </h2>
              <button
                onClick={() => setShowAccountSettings(false)}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-medium text-stone-500 mb-2">계정 정보</h3>
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-stone-200 rounded-full flex items-center justify-center text-stone-600 font-bold">
                      {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-medium text-stone-900">{currentUser.displayName || '사용자'}</div>
                      <div className="text-sm text-stone-500">{currentUser.email}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-stone-500 mb-2">구독 상태</h3>
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-100 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-stone-900">
                      {isSubscribed ? 'PRO 요금제' : '무료 요금제'}
                    </div>
                    <div className="text-sm text-stone-500">
                      {isSubscribed ? '무제한 분석 기능 사용 가능' : '분석 기능을 사용하려면 구독이 필요합니다'}
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${isSubscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-600'}`}>
                    {isSubscribed ? '활성' : '비활성'}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100">
                {isSubscribed ? (
                  <button
                    onClick={handleManageSubscription}
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                    구독 관리 및 해지
                  </button>
                ) : (
                  <button
                    onClick={handleSubscribe}
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    PRO 구독하기
                  </button>
                )}
                {isSubscribed && (
                  <p className="text-xs text-stone-500 text-center mt-3">
                    Stripe 결제 포털로 이동하여 구독을 안전하게 해지하거나 결제 수단을 변경할 수 있습니다.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
