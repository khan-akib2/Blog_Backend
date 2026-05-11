const https = require('https');

/**
 * Send email via Brevo Transactional Email HTTP API.
 * No SMTP — no port 587 issues on Render or any cloud host.
 *
 * @param {Object} options - { to, subject, html }
 */
const sendEmail = async ({ to, subject, html }) => {
  const payload = JSON.stringify({
    sender: {
      name: process.env.EMAIL_FROM_NAME || 'BlogHub',
      email: process.env.EMAIL_FROM,
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000, // 10 second hard timeout
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Brevo API error ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Brevo API request timed out'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

module.exports = sendEmail;
