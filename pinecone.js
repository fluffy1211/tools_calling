import 'dotenv/config';

async function getIndexInfo() {
  const response = await fetch(`https://api.pinecone.io/indexes/${process.env.PINECONE_INDEX_NAME}`, {
    headers: {
      'Api-Key': process.env.PINECONE_API_KEY,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Pinecone API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  console.log('Index connected:', data);
}

async function getEmbeddings(text) {
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

function simpleChunk(text, maxWords = 50) {
    const words = text.split(' ');
    const chunks = [];
    for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(' '));
    }
    return chunks;
}

async function upsertChunks(chunks) {
  const response = await fetch(`${process.env.PINECONE_INDEX_HOST}/vectors/upsert`, {
    method: 'POST',
    headers: {
      'Api-Key': process.env.PINECONE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      vectors: await Promise.all(chunks.map(async (chunk, i) => ({
        id: `chunk-${Date.now()}-${i}`,
        values: await getEmbeddings(chunk),
        metadata: { text: chunk }
      })))
    })
  });

  if (!response.ok) {
    throw new Error(`Pinecone upsert error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  console.log('Chunks upserted:', data);
}

async function searchSimilar(query, topK = 3) {
  const embedding = await getEmbeddings(query);

  const response = await fetch(`${process.env.PINECONE_INDEX_HOST}/query`, {
    method: 'POST',
    headers: {
      'Api-Key': process.env.PINECONE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      vector: embedding,
      topK,
      includeMetadata: true
    })
  });

  if (!response.ok) {
    throw new Error(`Pinecone query error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.matches.map(match => ({ score: match.score, text: match.metadata.text }));
}

searchSimilar('De quelle couleur est le chat ?').then(results => {
  console.log('Résultats trouvés :\n');
  results.forEach(({ score, text }) => {
    console.log(`Score: ${score.toFixed(3)} | ${text}`);
  });
}).catch(console.error);

async function main() {
  await getIndexInfo();

  const text = `le chat est bleu`;

  const chunks = simpleChunk(text);
  console.log(`${chunks.length} chunks créés`);

  await upsertChunks(chunks);
}

main().catch(console.error);