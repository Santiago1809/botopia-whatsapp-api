export function generateSecurePassword() {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // Sin 'I' ni 'O'
  const lowercase = 'abcdefghijkmnopqrstuvwxyz' // Sin 'l'
  const numbers = '23456789' // Sin '0' ni '1'
  const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?/'

  const allChars = uppercase + lowercase + numbers + symbols
  let password = ''

  // Asegurar que la contraseña tenga al menos un carácter de cada tipo
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += symbols[Math.floor(Math.random() * symbols.length)]

  // Completar la contraseña con caracteres aleatorios
  for (let i = password.length; i < 16; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)]
  }
  password = password
    .split('')
    .sort(() => 0.5 - Math.random())
    .join('')

  return password
}
