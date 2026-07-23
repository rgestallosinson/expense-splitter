// netlify/functions/vision-ocr.js
//
// Proxies label photos to OCR.space so the API key never touches the
// browser. Deployed automatically by Netlify from this folder — no
// separate backend/server needed.
//
// Switched from Google Cloud Vision to OCR.space because Cloud Vision
// requires a linked billing account even for free-tier usage. OCR.space's
// free tier needs only an API key (no card), and its "overlay" mode still
// gives us per-word bounding boxes — so the front-end's "pick the biggest
// text on the label" logic keeps working unchanged.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server missing OCR_SPACE_API_KEY env var' })
    };
  }

  let base64Image;
  try {
    const parsed = JSON.parse(event.body || '{}');
    base64Image = parsed.image;
    if (!base64Image) throw new Error('No image provided');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  try {
    const params = new URLSearchParams();
    params.append('apikey', apiKey);
    params.append('base64Image', `data:image/jpeg;base64,${base64Image}`);
    params.append('OCREngine', '2');        // engine 2 = better accuracy on packaging/labels
    params.append('isOverlayRequired', 'true'); // gives us per-word bounding boxes
    params.append('scale', 'true');
    params.append('detectOrientation', 'true');

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await ocrRes.json();

    if (!ocrRes.ok || data.IsErroredOnProcessing) {
      const message = Array.isArray(data.ErrorMessage)
        ? data.ErrorMessage.join(', ')
        : (data.ErrorMessage || 'OCR.space request failed');
      return { statusCode: ocrRes.status || 500, body: JSON.stringify({ error: message }) };
    }

    const parsedResult = data?.ParsedResults?.[0];
    const text = parsedResult?.ParsedText || '';

    // Flatten OCR.space's per-line word boxes into the same { text, vertices }
    // shape the front-end already expects (4 corner points per word), so its
    // "largest font on the label" logic doesn't need to change at all.
    const words = [];
    const lines = parsedResult?.TextOverlay?.Lines || [];
    lines.forEach((line) => {
      (line.Words || []).forEach((w) => {
        const left = w.Left, top = w.Top, width = w.Width, height = w.Height;
        words.push({
          text: w.WordText,
          vertices: [
            { x: left, y: top },
            { x: left + width, y: top },
            { x: left + width, y: top + height },
            { x: left, y: top + height }
          ]
        });
      });
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, words })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unknown server error' }) };
  }
};