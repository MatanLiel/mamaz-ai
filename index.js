require('dotenv').config();

const { create } = require('venom-bot');
const OpenAI = require('openai');
const axios = require('axios');

const API_URL = process.env.API_URL;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const userStates = {};
const lastMessageDay = {};
const messageHistory = new Map();
let botNumber = null;

async function fetchConfig(phone) {
  try {
    const res = await axios.get(`${API_URL}/api/config/${phone}`);
    return res.data;
  } catch (err) {
    console.error('שגיאה בקריאת קונפיג מהשרת:', err.message);
    return null;
  }
}

async function saveConfig(phone, data) {
  try {
    await axios.post(`${API_URL}/api/config`, { phone, config: data });
  } catch (err) {
    console.error('שגיאה בשמירת קונפיג:', err.message);
  }
}

async function fetchOnboardingSteps() {
  try {
    const res = await axios.get(`${API_URL}/api/onboarding`);
    return res.data;
  } catch (err) {
    console.error('שגיאה בקריאת שלבי onboarding:', err.message);
    return [];
  }
}

function buildPrompt(config) {
  const assistantName = config.assistant_name || 'העוזר האישי';
  const description = config.description || 'עוזר אישי חכם המייצג את העסק';
  const tone = config.tone || 'שפה ידידותית ולא רשמית';

  return {
    role: 'system',
    content: `אתה ${assistantName} – ${description}.
ענה ללקוחות בטון ${tone}.
שים לב לא לחזור על עצמך, השתמש בשפה טבעית, והימנע מניסוחים רשמיים מדי.`
  };
}

async function generateGPTReply(config, messageText, senderId, isNewConversation) {
  const history = messageHistory.get(senderId) || [];
  const promptSystem = buildPrompt(config);

  history.push({ role: 'user', content: messageText });
  const messages = [promptSystem, ...history.slice(-6)];

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages
  });

  const reply = response.choices[0].message.content.trim();
  history.push({ role: 'assistant', content: reply });
  messageHistory.set(senderId, history);

  return isNewConversation ? `היי! ${reply}` : reply;
}

create({ session: process.env.BOT_NAME || 'mamaz', headless: true })
  .then((client) => {
    client.getHostDevice().then((host) => {
      if (!host || !host.wid || !host.wid.user) {
        console.error('❌ לא ניתן לקרוא את מספר הטלפון של הבוט.');
        return;
      }
      botNumber = `${host.wid.user}@c.us`;
      console.log('📞 הבוט פועל עם מספר:', botNumber);
    });

    client.onMessage(async (message) => {
      const senderId = message.from;
      const receiverId = message.to;
      const today = new Date().toDateString();
      const isNewConversation = lastMessageDay[senderId] !== today;
      lastMessageDay[senderId] = today;

      if (message.body.trim() === 'הגדרה') {
        if (senderId !== botNumber) {
          await client.sendText(senderId, '⚠️ רק מתן (המספר שמחובר לבוט) יכול לבצע הגדרה.');
          return;
        }
        const steps = await fetchOnboardingSteps();
        userStates[senderId] = { step: 0, data: {} };
        await client.sendText(senderId, `${steps[0].question}\n(לדוגמה: ${steps[0].placeholder})`);
        return;
      }

      if (userStates[senderId]) {
        const steps = await fetchOnboardingSteps();
        const state = userStates[senderId];
        const currentStep = steps[state.step];
        state.data[currentStep.key] = message.body;
        state.step++;

        if (state.step < steps.length) {
          const nextStep = steps[state.step];
          await client.sendText(senderId, `${nextStep.question}\n(לדוגמה: ${nextStep.placeholder})`);
        } else {
          await saveConfig(senderId, state.data);
          delete userStates[senderId];
          await client.sendText(senderId, '✅ ההגדרה הושלמה! עופר מוכן לפעולה 💪');
        }
        return;
      }

      const config = await fetchConfig(receiverId);
      if (!config) return;

      try {
        const reply = await generateGPTReply(config, message.body, senderId, isNewConversation);
        await client.sendText(senderId, reply);
      } catch (err) {
        console.error('GPT error:', err);
        await client.sendText(senderId, '⚠️ הייתה תקלה זמנית. נסה שוב בעוד רגע.');
      }
    });
  })
  .catch((error) => {
    console.error('שגיאה ביצירת הבוט:', error);
  });
