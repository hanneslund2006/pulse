const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `Du er en markedsanalytiker for swingtraders. \
Søk etter ferske finansnyheter og returner ALLTID i dette eksakte formatet:

DATO: [dato og tidspunkt]

MAKRO: [BULLISH/BEARISH/NØYTRAL] — [1 setning begrunnelse]
TECH: [BULLISH/BEARISH/NØYTRAL] — [1 setning begrunnelse]
ENERGI: [BULLISH/BEARISH/NØYTRAL] — [1 setning begrunnelse]
FINANS: [BULLISH/BEARISH/NØYTRAL] — [1 setning begrunnelse]

SAMLET: [BULLISH/BEARISH/BLANDET] — [1-2 setninger overordnet konklusjon]

SWING OBS: [1-2 setninger om hva en swingtrader bør passe på i dag]

Vær konkret og kortfattet. Ingen lange forklaringer.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API-nøkkel mangler. Sett ANTHROPIC_API_KEY i miljøvariabler.' });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const messages = [
      {
        role: 'user',
        content: 'Søk etter dagens markedssentiment og gi meg en rapport for swingtraders.'
      }
    ];

    let finalText = '';
    const MAX_ITERATIONS = 10;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages
      });

      if (response.stop_reason === 'end_turn') {
        finalText = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();
        break;
      }

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });

        const toolResults = response.content
          .filter(b => b.type === 'tool_use')
          .map(b => ({
            type: 'tool_result',
            tool_use_id: b.id,
            content: []
          }));

        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        }
      } else {
        // Uventet stop_reason — hent tekst uansett
        finalText = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();
        break;
      }
    }

    if (!finalText) {
      return res.status(500).json({ error: 'Fikk ikke svar fra AI. Prøv igjen.' });
    }

    return res.status(200).json({ sentiment: finalText });

  } catch (error) {
    console.error('Anthropic API feil:', error);

    const message = error.status === 401
      ? 'Ugyldig API-nøkkel.'
      : error.status === 429
        ? 'For mange forespørsler. Vent litt og prøv igjen.'
        : 'Klarte ikke hente sentiment. Prøv igjen.';

    return res.status(500).json({ error: message });
  }
};
