import axios from 'axios';

// Em desenvolvimento (Vite local): usa '/api' para passar pelo proxy do vite.config.js
// Em produção (Servidor PTU-GTI-05): usa '' (string vazia) para chamar /token, /users, etc. diretamente na raiz HTTPS
const api = axios.create({
  baseURL: import.meta.env.DEV ? '/api' : ''
});

// O Interceptador: Pega o token salvo no login e cola no cabeçalho de toda nova requisição
api.interceptors.request.use(async config => {
  const token = localStorage.getItem('@kad_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;