const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG_DIR = path.join(__dirname, 'configs');
const ONBOARDING_FILE = path.join(__dirname, 'onboarding_steps.json');

app.use(cors());
app.use(express.json());

if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR);
}

// שליפת קונפיג לפי מספר טלפון
app.get('/api/config/:phone', (req, res) => {
  const phone = req.params.phone;
  const filePath = path.join(CONFIG_DIR, `${phone}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json(null);
  }

  const config = JSON.parse(fs.readFileSync(filePath));
  res.json(config);
});

// שמירת קונפיג חדש
app.post('/api/config', (req, res) => {
  const { phone, config } = req.body;
  if (!phone || !config) {
    return res.status(400).json({ error: 'Missing phone or config' });
  }

  const filePath = path.join(CONFIG_DIR, `${phone}.json`);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  res.sendStatus(200);
});

// שליפת שלבים להגדרה ראשונית (onboarding)
app.get('/api/onboarding', (req, res) => {
  if (!fs.existsSync(ONBOARDING_FILE)) {
    return res.status(500).json({ error: 'Missing onboarding file' });
  }

  const steps = JSON.parse(fs.readFileSync(ONBOARDING_FILE));
  res.json(steps);
});

app.listen(PORT, () => {
  console.log(`🟢 API server running at http://localhost:${PORT}`);
});
