const TOKEN_KEY = 'veo_bearer_token';

export const saveToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const getToken = (): string => {
  return localStorage.getItem(TOKEN_KEY) || '';
};

export const hasToken = (): boolean => {
  const token = getToken();
  return token.length > 0;
};