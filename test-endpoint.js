import fs from 'fs';

async function test() {
  const minimalPdf = Buffer.from(
    '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%EOF\n'
  );
  
  const formData = new FormData();
  formData.append('file', new Blob([minimalPdf]), 'test.pdf');
  
  try {
    const res = await fetch('http://localhost:3000/api/extract-pdf', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    console.log('Response:', data);
  } catch (e) {
    console.error(e);
  }
}
test();
