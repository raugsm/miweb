// Configura Supabase
const supabaseUrl = 'https://cafzaniulikvqtntrvgd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZnphbml1bGlrdnF0bnRydmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgzMjYzMDIsImV4cCI6MjA1MzkwMjMwMn0.2wybQuAUYPeuUaqwrklyXNGAvAPtzIzikTYAckk2Sh0';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Obtener los elementos del formulario
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-button');
const registerButton = document.getElementById('register-button');

// Función de login
async function login() {
  // Validar que los campos estén llenos
  if (emailInput.value.trim() === '' || passwordInput.value.trim() === '') {
    alert('Por favor, complete todos los campos');
    return;
  }

  // Validar que el correo electrónico sea válido
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(emailInput.value)) {
    alert('Por favor, ingrese un correo electrónico válido');
    return;
  }

  // Validar que la contraseña tenga al menos 8 caracteres
  if (passwordInput.value.length < 8) {
    alert('Por favor, ingrese una contraseña con al menos 8 caracteres');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailInput.value,
      password: passwordInput.value,
    });

    if (error) {
      console.error('Error al iniciar sesión:', error);
    } else {
      console.log('Inició sesión correctamente:', data);
      window.location.href = 'index.html';
    }
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
  }
}

// Agregar evento de clic al botón de login
loginButton.addEventListener('click', function(event) {
  event.preventDefault();
  login();
});

registerButton.addEventListener('click', function(event) {
  event.preventDefault();
  window.location.href = 'registro.html';
});