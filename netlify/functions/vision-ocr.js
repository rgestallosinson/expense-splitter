// netlify/functions/vision-ocr.js
//
// Proxies label photos to Google Cloud Vision so the API key never
// touches the browser. Deployed automatically by Netlify from this
// folder — no separate backend/server needed.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server missing GOOGLE_VISION_API_KEY env var' })
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
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
            }
          ]
        })
      }
    );

    const data = await visionRes.json();

    if (!visionRes.ok) {
      const message = data?.error?.message || 'Cloud Vision request failed';
      return { statusCode: visionRes.status, body: JSON.stringify({ error: message }) };
    }

    const text = data?.responses?.[0]?.fullTextAnnotation?.text || '';

    // textAnnotations[0] is the full block of text (same as fullTextAnnotation.text);
    // everything after that is one entry per detected word, each with its own
    // bounding box. We pass these along so the front-end can tell which words
    // are printed in the biggest font — on real packaging that's almost always
    // the product name, regardless of how much other (smaller) text surrounds it.
    const rawAnnotations = data?.responses?.[0]?.textAnnotations || [];
    const words = rawAnnotations.slice(1).map((w) => ({
      text: w.description,
      vertices: w.boundingPoly?.vertices || []
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, words })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unknown server error' }) };
  }
};
