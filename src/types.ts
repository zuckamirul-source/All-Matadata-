export interface ImageMetadata {
  id: string;
  fileName: string;
  previewUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  data?: GeneratedMetadata;
  error?: string;
  details?: {
    size: string;
    format: string;
    resolution: string;
  };
}

export interface GeneratedMetadata {
  title: string;
  description: string;
  keywords: string[];
  category: string;
  analysis: {
    objects: string[];
    sceneType: string;
    composition: string;
    colors: string[];
  };
}

export enum StockMarketplace {
  SHUTTERSTOCK = 'shutterstock',
  ADOBE_STOCK = 'adobe_stock',
  FREEPIK = 'freepik',
}

export interface APIConfig {
  gemini?: string;
  openai?: string;
  mistral?: string;
  xai?: string; // Grok
  anthropic?: string; // Claude
  activeProvider: 'gemini' | 'openai' | 'mistral' | 'xai' | 'anthropic';
}
