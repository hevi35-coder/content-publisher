require('dotenv').config();
const { notifier } = require('./lib/notifier');
const fs = require('fs');
const path = require('path');

async function sendDraft() {
    const draftPath = '/Users/jhsy/.gemini/antigravity/brain/7aefc69a-dbdb-488b-b267-599d639cad97/draft_geeknews_mandaact.md';
    const draftContent = fs.readFileSync(draftPath, 'utf8');

    console.log("📨 Sending draft to hevi35@gmail.com...");

    // Override recipient for this specific call if needed, 
    // but Notifier uses NOTIFY_EMAIL_TO or GMAIL_USER.
    // We will force the 'details' to contain the markdown.

    // Since notifier._buildHtml is structured for steps, we will hack it slightly
    // or just use the raw transporter if possible. 
    // Accessing notifier.transporter directly is cleaner for custom emails.

    if (!notifier.enabled) {
        console.error("❌ Notifier is disabled (Missing GMAIL_USER/PASS). Cannot send email.");
        return;
    }

    try {
        await notifier.transporter.sendMail({
            from: `"MandaAct Bot" <${process.env.GMAIL_USER}>`,
            to: "hevi35@gmail.com",
            subject: "📝 [Draft] GeekNews Promotion: MandaAct",
            text: draftContent, // Plain text markdown
            html: `<pre style="font-family: monospace; white-space: pre-wrap;">${draftContent}</pre>` // Simple HTML wrapper
        });
        console.log("✅ Email sent successfully!");
    } catch (error) {
        console.error("❌ Failed to send email:", error);
    }
}

sendDraft();
