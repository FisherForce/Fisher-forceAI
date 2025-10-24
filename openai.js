const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

async function enrichWithOpenAI(input, baseAdvice) {
  const prompt = `Tu es un assistant expert en pêche. Reformule et enrichis le conseil ci-dessous, en français, pour qu'il soit clair, pratique et actionnable. N'ajoute pas de références commerciales sauf si elles sont indiquées dans la partie 'sponsorMatches'.\n\nINPUT:\n${JSON.stringify(input, null, 2)}\n\nBASE_ADVICE:\n${JSON.stringify(baseAdvice, null, 2)}\n\nDON'T invent new sponsor models. Use sponsorMatches as-is if present. Provide 3 concise bullet points with concrete actions.`;

  const response = await openai.createChatCompletion({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: 'Tu es un assistant expert en pêche, concis et pédagogique.' }, { role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.3
  });

  const text = response.data.choices?.[0]?.message?.content;
  return text || 'Conseil enrichi indisponible.';
}

module.exports = { enrichWithOpenAI };
