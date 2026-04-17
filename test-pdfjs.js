import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import path from 'path';
import fs from 'fs';

async function test() {
  try {
    // Create a dummy PDF or just check if getDocument is a function
    console.log('getDocument is:', typeof getDocument);
  } catch (e) {
    console.error(e);
  }
}
test();
