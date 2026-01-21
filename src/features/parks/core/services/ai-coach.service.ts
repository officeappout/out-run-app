const AI_API_KEY = process.env.NEXT_PUBLIC_AI_API_KEY;

/**
 * משיכת המלצת AI מבוססת OpenAI
 */
export async function getAIRecommendation(userPrompt: string): Promise<string> {
    if (!AI_API_KEY) {
        console.error("Missing NEXT_PUBLIC_AI_API_KEY");
        return "שגיאה: חסר מפתח API.";
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: "You are an energetic and professional fitness coach. Answer in Hebrew. Keep it short (max 2 sentences) and motivating."
                    },
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ],
                temperature: 0.7,
            }),
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        return data.choices[0].message.content || "לא הצלחתי לקבל תשובה מהמאמן.";
    } catch (error) {
        console.error("AI Coach Service Error:", error);
        return "מצטער, המאמן כרגע בשיחה אחרת. נסה שוב מאוחר יותר! 💪";
    }
}

// Keep the old object export just in case something else relies on it, 
// but the user specifically asked for an exported function.
export const AICoachService = {
    getAIRecommendation: (msg: string) => getAIRecommendation(msg)
};
