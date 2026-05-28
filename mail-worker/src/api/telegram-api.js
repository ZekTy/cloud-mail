import app from '../hono/hono';
import telegramService from '../service/telegram-service';
import forwardRuleService from '../service/forward-rule-service';

app.get('/telegram/getEmail/:token', async (c) => {
	const content = await telegramService.getEmailContent(c, c.req.param());
	c.header('Cache-Control', 'public, max-age=604800, immutable');
	return c.html(content)
});

async function handleWebhook(c) {
	const secret = c.req.param('secret') || c.req.header('X-Telegram-Bot-Api-Secret-Token');

	if (c.env.jwt_secret && secret !== c.env.jwt_secret) {
		return c.json({ ok: false, description: 'Forbidden' }, 403);
	}

	const update = await c.req.json();
	await forwardRuleService.handleTelegramUpdate(c, update);
	return c.json({ ok: true });
}

app.post('/telegram/webhook', handleWebhook);
app.post('/telegram/webhook/:secret', handleWebhook);
