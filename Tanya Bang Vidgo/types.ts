export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  images?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export interface APIError {
  message: string;
  code?: string;
}
