const fs = require('fs');
const PDFParser = require("pdf2json");

const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
pdfParser.on("pdfParser_dataReady", pdfData => {
    fs.writeFileSync('pdf_out_utf8.txt', pdfParser.getRawTextContent(), 'utf-8');
});

pdfParser.loadPDF("Lovable layout.pdf");
