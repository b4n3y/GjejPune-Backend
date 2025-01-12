const verificationEmailTemplate = (name, token, backendUrl) => ({
  subject: 'Verify Your Email Address',
  html: `
    <h1>Welcome ${name}!</h1>
    <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
    <a href="${backendUrl}/v1/auth/verify-email/${token}">Verify Email</a>
    <p>This link will expire in 15 minutes.</p>
    <p>If you didn't register for an account, please ignore this email.</p>
  `
});

const passwordResetTemplate = (name, token, backendUrl) => ({
  subject: 'Reset Your Password',
  html: `
    <h1>Reset Your Password</h1>
    <p>Hello ${name},</p>
    <p>Click the link below to reset your password. This link will expire in 15 minutes.</p>
    <a href="${backendUrl}/v1/auth/reset-password/${token}">Reset Password</a>
    <p>If you did not request this, please ignore this email and make sure your account is secure.</p>
  `
});

module.exports = {
  verificationEmailTemplate,
  passwordResetTemplate
}; 