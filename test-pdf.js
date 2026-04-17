const fs = require('fs');
const pdfParse = require('pdf-parse');

async function test() {
  try {
    console.log("pdfParse type:", typeof pdfParse);
  } catch (e) {
    console.error(e);
  }
}
test();
