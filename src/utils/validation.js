const validatePassword = (password) => {
  const errors = [];

  // Length check
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  // Complexity checks
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)');
  }

  // Common password check (this is a small sample, you should use a more comprehensive list)
  const commonPasswords = [
    'password123',
    'qwerty123',
    '12345678',
    'admin123',
    'letmein123'
  ];
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common. Please choose a more secure password');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhoneNumber = (phoneNumber) => {
  // Basic phone number validation (you should adjust based on your requirements)
  const phoneRegex = /^\+?[\d\s-]{10,}$/;
  return phoneRegex.test(phoneNumber);
};

module.exports = {
  validatePassword,
  validateEmail,
  validatePhoneNumber
}; 