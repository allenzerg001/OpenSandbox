import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080',
});

const apiKey = import.meta.env.VITE_API_KEY || '';
if (apiKey) {
  client.defaults.headers.common['OPEN-SANDBOX-API-KEY'] = apiKey;
}

export default client;
