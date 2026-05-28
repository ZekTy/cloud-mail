const ARRAY_FIELDS = ['tgChatIds', 'adminIds', 'senderWhitelist', 'keywordWhitelist', 'keywordBlacklist'];

function splitList(value, numeric = false) {
	if (Array.isArray(value)) {
		return value
			.map(item => numeric ? Number(item) : String(item).trim())
			.filter(item => numeric ? Number.isFinite(item) : item);
	}

	if (value === undefined || value === null || value === '') {
		return [];
	}

	return String(value)
		.split(/[,，\s]+/)
		.map(item => numeric ? Number(item) : item.trim())
		.filter(item => numeric ? Number.isFinite(item) : item);
}

export function normalizeForwardRule(rule = {}) {
	const normalized = {
		email: String(rule.email || '').trim().toLowerCase(),
		enabled: rule.enabled === undefined ? true : !!rule.enabled,
		blockNoticeEnabled: rule.blockNoticeEnabled === undefined ? true : !!rule.blockNoticeEnabled,
		tgChatIds: splitList(rule.tgChatIds),
		adminIds: splitList(rule.adminIds, true),
		senderWhitelist: splitList(rule.senderWhitelist),
		keywordWhitelist: splitList(rule.keywordWhitelist),
		keywordBlacklist: splitList(rule.keywordBlacklist)
	};

	for (const field of ARRAY_FIELDS) {
		normalized[field] = Array.from(new Set(normalized[field]));
	}

	return normalized;
}

export function normalizeForwardRules(rules = []) {
	if (!Array.isArray(rules)) {
		return [];
	}

	return rules
		.map(rule => normalizeForwardRule(rule))
		.filter(rule => rule.email);
}

export function findForwardRule(rules = [], email = '') {
	const target = String(email || '').trim().toLowerCase();
	return normalizeForwardRules(rules).find(rule => rule.enabled && rule.email === target);
}

export function getForwardRuleByEmail(rules = [], email = '') {
	const target = String(email || '').trim().toLowerCase();
	return normalizeForwardRules(rules).find(rule => rule.email === target);
}

export function upsertForwardRule(rules = [], rule) {
	const normalized = normalizeForwardRule(rule);
	const normalizedRules = normalizeForwardRules(rules);
	const index = normalizedRules.findIndex(item => item.email === normalized.email);

	if (index > -1) {
		normalizedRules[index] = normalized;
	} else if (normalized.email) {
		normalizedRules.push(normalized);
	}

	return normalizedRules;
}

export function matchForwardRuleFilter(rule, emailRow) {
	const sender = String(emailRow.sendEmail || '').toLowerCase();
	const subject = String(emailRow.subject || '').toLowerCase();
	const body = `${emailRow.text || ''}\n${emailRow.content || ''}`.toLowerCase();

	if (rule.senderWhitelist.length > 0) {
		const allowed = rule.senderWhitelist.some(item => sender.includes(String(item).toLowerCase()));
		if (!allowed) {
			return { allowed: false, reason: '发件人未授权' };
		}
	}

	const whiteKeyword = rule.keywordWhitelist.find(item => {
		const keyword = String(item).toLowerCase();
		return keyword && (subject.includes(keyword) || body.includes(keyword));
	});

	if (whiteKeyword) {
		return { allowed: true, reason: `命中白名单 ${whiteKeyword}` };
	}

	const blackKeyword = rule.keywordBlacklist.find(item => {
		const keyword = String(item).toLowerCase();
		return keyword && (subject.includes(keyword) || body.includes(keyword));
	});

	if (blackKeyword) {
		return { allowed: false, reason: `包含敏感词 ${blackKeyword}` };
	}

	return { allowed: true };
}
