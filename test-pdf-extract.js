import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import path from 'path';

async function test() {
  try {
    const minimalPdf = Buffer.from(
      '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%EOF\n'
    );
    const pdf = await getDocument({ 
      data: new Uint8Array(minimalPdf),
      cMapUrl: path.join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/')
    }).promise;
    console.log('Pages:', pdf.numPages);
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
