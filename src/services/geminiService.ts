import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedMetadata, StockMarketplace } from "../types";

const metadataSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Short, commercial, SEO-friendly title (max 70 characters)",
    },
    description: {
      type: Type.STRING,
      description: "1-3 lines, natural language, buyer-focused description",
    },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "30-50 highly relevant tags, prioritized by commercial value",
    },
    category: {
      type: Type.STRING,
      description: "Suggested stock category (e.g., nature, business, abstract)",
    },
    analysis: {
      type: Type.OBJECT,
      properties: {
        objects: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Main objects detected in the scene",
        },
        sceneType: {
          type: Type.STRING,
          description: "Indoor, outdoor, studio, abstract, etc.",
        },
        composition: {
          type: Type.STRING,
          description: "Minimal, flat lay, close-up, wide-angle, etc.",
        },
        colors: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Dominant color palette descriptions",
        },
      },
      required: ["objects", "sceneType", "composition", "colors"],
    },
  },
  required: ["title", "description", "keywords", "category", "analysis"],
};

export async function analyzeImage(base64Data: string, mimeType: string, marketplace: StockMarketplace, customApiKey?: string): Promise<GeneratedMetadata> {
  const apiKey = customApiKey || (process.env.GEMINI_API_KEY as string);
  
  if (!apiKey) {
    throw new Error("No Gemini API key found. Please set one in the settings panel.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  
  const prompt = `Analyze this image for the ${marketplace.toUpperCase()} stock photography marketplace. 
  
  Generate professional, high-converting metadata following these SPECIFIC rules for ${marketplace.toUpperCase()}:
  
  ${marketplace === StockMarketplace.ADOBE_STOCK ? 
    '- Title: Commercial and descriptive, max 70 chars. Focus on the core subject. Avoid artistic metaphors.\n- Keywords: 35-50 tags. List the most important 7 first (Adobe weight system).' : 
    marketplace === StockMarketplace.SHUTTERSTOCK ?
    '- Description: Natural language, "who, what, where" format, 7-200 characters.\n- Keywords: 50 relevant tags. Focus on search volume trends.' :
    '- Title: Catchy but clear.\n- Keywords: Comma separated, inclusive of broad and niche tags.'
  }

  1. Title: High CTR, SEO-optimized.
  2. Description: Natural language, buyer-focused.
  3. Keywords: 40-50 highly relevant tags. Prioritize by commercial value.
  4. Category: Suggest the most accurate standard category for ${marketplace}.
  5. Analysis: Detect main objects, scene type, and composition.

  Rules:
  - NO trademarked names.
  - NO copyright content.
  - Focus on what a buyer (designer/marketer) would search for.
  - Return the results in strict JSON format.` ;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Data, mimeType } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: metadataSchema,
      }
    });

    if (!response.text) {
      throw new Error("No response text from Gemini");
    }

    return JSON.parse(response.text) as GeneratedMetadata;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
}
