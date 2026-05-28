import settingService from './setting-service';
import telegramService from './telegram-service';
import {
	findForwardRule,
	getForwardRuleByEmail,
	matchForwardRuleFilter,
	normalizeForwardRules,
	upsertForwardRule
} from '../utils/forward-rule-utils';

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function listToText(items) {
	return items.length ? escapeHtml(items.join(', ')) : '空';
}

const forwardRuleService = {

	async processEmail(c, emailRow) {
		const { forwardRules } = await settingService.query(c);
		const rule = findForwardRule(forwardRules, emailRow.toEmail);

		if (!rule || rule.tgChatIds.length === 0) {
			return;
		}

		const filter = matchForwardRuleFilter(rule, emailRow);
		if (!filter.allowed) {
			if (rule.blockNoticeEnabled) {
				await this.sendBlockNotice(c, rule, emailRow, filter.reason);
			}
			return;
		}

		await telegramService.sendEmailToBot(c, emailRow, { chatIds: rule.tgChatIds });
	},

	async sendBlockNotice(c, rule, emailRow, reason) {
		const text = [
			'<b>安全拦截提醒</b>',
			`规则: <code>${escapeHtml(rule.email)}</code>`,
			`原因: ${escapeHtml(reason)}`,
			`发件人: ${escapeHtml(emailRow.sendEmail || '')}`,
			`主题: ${escapeHtml(emailRow.subject || '')}`
		].join('\n');

		await Promise.all(rule.tgChatIds.map(chatId => telegramService.sendMessage(c, { chatId, text })));
	},

	async handleTelegramUpdate(c, update) {
		const message = update?.message;
		const text = String(message?.text || '').trim();
		const chatId = message?.chat?.id;
		const senderId = message?.from?.id;
		const chatType = message?.chat?.type;

		if (!message || !text.startsWith('/') || chatType !== 'private') {
			return;
		}

		const setting = await settingService.query(c);
		const rules = normalizeForwardRules(setting.forwardRules);
		const isAdmin = rules.some(rule => rule.adminIds.includes(Number(senderId)));

		if (!isAdmin) {
			return;
		}

		const response = await this.handleCommand(c, rules, text);
		if (response) {
			await telegramService.sendMessage(c, { chatId, text: response });
		}
	},

	async handleCommand(c, rules, text) {
		const [command, email, type, ...valueParts] = text.split(/\s+/);
		const cmd = command.split('@')[0].toLowerCase();
		const targetEmail = String(email || '').trim().toLowerCase();

		if (!targetEmail) {
			return this.helpText();
		}

		const rule = getForwardRuleByEmail(rules, targetEmail);
		if (!rule) {
			return `未找到规则: <code>${escapeHtml(targetEmail)}</code>`;
		}

		if (cmd === '/list') {
			return this.ruleText(rule);
		}

		if (cmd === '/reload') {
			await settingService.refresh(c);
			return `已重新加载规则: <code>${escapeHtml(targetEmail)}</code>`;
		}

		if (!['/add', '/remove', '/del'].includes(cmd)) {
			return this.helpText();
		}

		const listName = this.commandTypeToListName(type);
		const value = valueParts.join(' ').trim();

		if (!listName || !value) {
			return this.helpText();
		}

		const list = rule[listName];
		const normalizedValue = listName === 'adminIds' ? Number(value) : value;

		if (listName === 'adminIds' && !Number.isFinite(normalizedValue)) {
			return '管理员 ID 必须是数字';
		}

		if (cmd === '/add') {
			if (!list.includes(normalizedValue)) {
				list.push(normalizedValue);
			}
		} else {
			const index = list.indexOf(normalizedValue);
			if (index > -1) {
				list.splice(index, 1);
			}
		}

		const nextRules = upsertForwardRule(rules, rule);
		await settingService.set(c, { forwardRules: nextRules });

		return cmd === '/add'
			? `已添加 <b>${escapeHtml(value)}</b> 到 <code>${escapeHtml(targetEmail)}</code>`
			: `已移除 <b>${escapeHtml(value)}</b> 从 <code>${escapeHtml(targetEmail)}</code>`;
	},

	commandTypeToListName(type = '') {
		const value = type.toLowerCase();
		if (['black', 'blacklist', 'hei'].includes(value)) return 'keywordBlacklist';
		if (['white', 'whitelist', 'bai'].includes(value)) return 'keywordWhitelist';
		if (['sender', 'from'].includes(value)) return 'senderWhitelist';
		if (['admin', 'op'].includes(value)) return 'adminIds';
		return '';
	},

	ruleText(rule) {
		return [
			`<b>${escapeHtml(rule.email)}</b>`,
			`状态: ${rule.enabled ? '启用' : '关闭'}`,
			`TG Chat: ${listToText(rule.tgChatIds)}`,
			`管理员: ${listToText(rule.adminIds)}`,
			`发件人白名单: ${listToText(rule.senderWhitelist)}`,
			`关键词白名单: ${listToText(rule.keywordWhitelist)}`,
			`关键词黑名单: ${listToText(rule.keywordBlacklist)}`
		].join('\n');
	},

	helpText() {
		return [
			'<b>命令格式</b>',
			'<code>/list netflix@inklazy.com</code>',
			'<code>/add netflix@inklazy.com black reset</code>',
			'<code>/add netflix@inklazy.com white household</code>',
			'<code>/add netflix@inklazy.com sender netflix.com</code>',
			'<code>/remove netflix@inklazy.com black reset</code>',
			'<code>/reload netflix@inklazy.com</code>'
		].join('\n');
	}
};

export default forwardRuleService;
