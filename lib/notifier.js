/**
 * Notifier - Email notification system using Gmail SMTP
 * 
 * Sends step-by-step notifications for the publishing pipeline.
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

class Notifier {
    constructor() {
        this.enabled = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
        this.transporter = null;

        if (this.enabled) {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_APP_PASSWORD
                }
            });
        }
    }

    /**
     * Send notification
     * @param {Object} options
     * @param {string} options.type - 'step_complete' | 'step_failed' | 'pipeline_complete'
     * @param {string} options.step - Step name
     * @param {string} options.status - 'success' | 'failed' | 'warning'
     * @param {Object} options.details - Additional details
     */
    async send({ type, step, status, details = {}, attachments = [] }) {
        if (!this.enabled) {
            console.log(`📧 [Notifier] Disabled (no credentials). Would send: ${type} - ${step}`);
            return { sent: false, reason: 'disabled' };
        }

        const subject = this._buildSubject(type, step, status);
        const html = this._buildHtml(type, step, status, details);

        try {
            const info = await this.transporter.sendMail({
                from: `"MandaAct Bot" <${process.env.GMAIL_USER}>`,
                to: process.env.NOTIFY_EMAIL_TO || process.env.GMAIL_USER,
                subject,
                html,
                attachments
            });

            console.log(`📧 [Notifier] Email sent: ${info.messageId}`);
            return { sent: true, messageId: info.messageId };
        } catch (error) {
            console.error(`📧 [Notifier] Failed to send email:`, error.message);
            return { sent: false, error: error.message };
        }
    }

    _buildSubject(type, step, status) {
        const emoji = status === 'success' ? '✅' : status === 'failed' ? '❌' : '⚠️';
        const stepName = this._formatStepName(step);

        switch (type) {
            case 'step_complete':
                return `${emoji} [Content Publisher] ${stepName} 완료`;
            case 'step_failed':
                return `${emoji} [Content Publisher] ${stepName} 실패`;
            case 'pipeline_complete':
                return `🎉 [Content Publisher] 전체 파이프라인 완료`;
            default:
                return `[Content Publisher] ${stepName}`;
        }
    }

    _buildHtml(type, step, status, details) {
        const stepName = this._formatStepName(step);
        const statusColor = status === 'success' ? '#03c75a' : status === 'failed' ? '#e74c3c' : '#f39c12';
        const statusText = status === 'success' ? '성공' : status === 'failed' ? '실패' : '경고';

        let detailsHtml = '';
        if (Object.keys(details).length > 0) {
            detailsHtml = '<h3>상세 정보</h3><ul>';
            for (const [key, value] of Object.entries(details)) {
                if (key === 'previewHtml' || key === 'error') continue; // Skip large content or error object
                detailsHtml += `<li><strong>${key}:</strong> ${value}</li>`;
            }
            detailsHtml += '</ul>';
        }

        let previewSection = '';
        if (details.previewHtml) {
            previewSection = `
            <div style="margin-top: 30px; border-top: 2px dashed #ccc; padding-top: 20px;">
                <h3>📱 모바일 복사영역 (아래 내용을 꾹 눌러 복사하세요)</h3>
                <div style="background: white; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
                    ${details.previewHtml}
                </div>
            </div>`;
        }

        if (status === 'failed' && details.error) {
            detailsHtml += `<div style="color: red; margin-top: 10px; padding: 10px; background: #ffe6e6; border-radius: 5px;"><strong>Stack Trace:</strong><pre style="white-space: pre-wrap;">${details.error}</pre></div>`;
        }

        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${statusColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
        .status { display: inline-block; padding: 5px 15px; border-radius: 15px; background: ${statusColor}; color: white; }
        h1 { margin: 0; font-size: 20px; }
        h3 { color: #333; margin-bottom: 10px; }
        ul { padding-left: 20px; }
        li { margin: 5px 0; }
        .footer { margin-top: 20px; color: #666; font-size: 12px; }
        a { color: #03c75a; text-decoration: none; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 ${stepName}</h1>
    </div>
    <div class="content">
        <p><span class="status">${statusText}</span></p>
        <p>파이프라인 단계 "${stepName}"이(가) ${statusText}했습니다.</p>
        ${detailsHtml}
        ${previewSection}
        <p class="footer">이 메일은 Content Publisher 자동화 시스템에서 발송되었습니다.<br>시간: ${new Date().toLocaleString('ko-KR')}</p>
    </div>
</body>
</html>`;
    }

    _formatStepName(step) {
        const stepNames = {
            'topic_selection': '주제 선정',
            'draft_generation': '초안 생성',
            'pr_creation': 'PR 생성',
            'publish_devto': 'Dev.to 발행',
            'publish_hashnode': 'Hashnode 발행',
            'publish_blogger': 'Blogger 발행',
            'naver_export': '네이버 준비',
            'weekly_ops_report': '주간 운영 리포트'
        };
        return stepNames[step] || step;
    }

    /**
     * Convenience methods
     */
    async stepComplete(step, details = {}, attachments = []) {
        return this.send({ type: 'step_complete', step, status: 'success', details, attachments });
    }

    async stepFailed(step, error) {
        return this.send({ type: 'step_failed', step, status: 'failed', details: { error: error.message || error } });
    }

    async pipelineComplete(results) {
        return this.send({
            type: 'pipeline_complete',
            step: 'all',
            status: 'success',
            details: results
        });
    }
}

// Singleton instance
const notifier = new Notifier();

module.exports = { Notifier, notifier };
