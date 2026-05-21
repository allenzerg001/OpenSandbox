import axios from 'axios';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8080';
const STORAGE_KEY_URL = 'opensandbox_server_url';
const STORAGE_KEY_API_KEY = 'opensandbox_api_key';

export function getServerUrl(): string {
  return localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string) {
  localStorage.setItem(STORAGE_KEY_URL, url);
}

export function getApiKey(): string {
  return localStorage.getItem(STORAGE_KEY_API_KEY) || '';
}

export function setApiKey(key: string) {
  localStorage.setItem(STORAGE_KEY_API_KEY, key);
}

const client = axios.create();

client.interceptors.request.use((config) => {
  config.baseURL = getServerUrl();
  const apiKey = getApiKey();
  if (apiKey) {
    config.headers['OPEN-SANDBOX-API-KEY'] = apiKey;
  }
  return config;
});

export default client;
