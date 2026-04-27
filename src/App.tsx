import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import JSZip from 'jszip';
import { 
  Upload, 
  Trash2, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Image as ImageIcon,
  Plus,
  Sun,
  Moon,
  Settings,
  Zap,
  Sparkles,
  Cpu,
  Brain,
  Layers,
  Database,
  Cloud,
  ChevronRight,
  ShieldCheck,
  Copy,
  RefreshCw,
  Tag,
  Bell,
  Save,
  Clock,
  Maximize2,
  Layout,
  FileJson,
  X,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { analyzeImage } from './services/geminiService';
import { ImageMetadata, GeneratedMetadata, StockMarketplace, APIConfig } from './types';
import { cn } from './lib/utils';

const ADOBE_CATEGORIES = [
  "Animals", "Buildings and Architecture", "Business", "Drinks", "Environmental", 
  "States of Mind", "Food", "Graphic Resources", "Hobby and Leisure", "Industry", 
  "Landscapes", "Lifestyle", "People", "Plants and Flowers", "Religion and Culture", 
  "Science", "Social Issues", "Sports", "Technology", "Transport", "Travel"
];

const SHUTTERSTOCK_CATEGORIES = [
  "Abstract", "Animals/Wildlife", "The Arts", "Backgrounds/Textures", "Beauty/Fashion", 
  "Buildings/Landmarks", "Business/Finance", "Celebrities", "Editorial", "Education", 
  "Food and Drink", "Healthcare/Medical", "Holidays", "Industrial", "Interiors", 
  "Miscellaneous", "Nature", "Objects", "Parks/Outdoor", "People", "Religion", 
  "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", 
  "Vectors", "Vintage"
];

export default function App() {
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [marketplace, setMarketplace] = useState<StockMarketplace>(StockMarketplace.ADOBE_STOCK);
  const [batchStatus, setBatchStatus] = useState({ total: 0, processed: 0, isActive: false });
  
  // API Config state persisted to localStorage
  const [apiConfig, setApiConfig] = useState<APIConfig>(() => {
    const saved = localStorage.getItem('lensmeta_api_config');
    return saved ? JSON.parse(saved) : { activeProvider: 'gemini' };
  });

  useEffect(() => {
    localStorage.setItem('lensmeta_api_config', JSON.stringify(apiConfig));
  }, [apiConfig]);

  const selectedImage = useMemo(() => 
    images.find(img => img.id === selectedImageId), 
    [images, selectedImageId]
  );

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newImagesPromises = acceptedFiles.map(async file => {
      // Get image dimensions with timeout
      const dimensions = await new Promise<{w: number, h: number}>((resolve) => {
        const timeout = setTimeout(() => resolve({ w: 0, h: 0 }), 3000);
        const img = new Image();
        img.onload = () => {
          clearTimeout(timeout);
          resolve({ w: img.width, h: img.height });
        };
        img.onerror = () => {
          clearTimeout(timeout);
          resolve({ w: 0, h: 0 });
        };
        img.src = URL.createObjectURL(file);
      });

      return {
        id: Math.random().toString(36).substring(7),
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
        status: 'pending' as const,
        details: {
          size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
          format: file.type.split('/')[1].toUpperCase(),
          resolution: `${dimensions.w}x${dimensions.h}`
        }
      };
    });

    const newImages = await Promise.all(newImagesPromises);
    setImages(prev => [...prev, ...newImages]);
    if (!selectedImageId && newImages.length > 0) setSelectedImageId(newImages[0].id);
  }, [selectedImageId]);

  const generateMetadata = async () => {
    if (!selectedImage || selectedImage.status === 'processing') return;

    updateImageStatus(selectedImage.id, 'processing');
    
    try {
      const response = await fetch(selectedImage.previewUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;

      const metadata = await analyzeImage(base64Data, blob.type, marketplace, apiConfig.gemini);
      
      setImages(prev => prev.map(img => 
        img.id === selectedImage.id ? { ...img, status: 'completed', data: metadata } : img
      ));
      toast.success("Metadata Generated Successfully");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Analysis failed';
      updateImageStatus(selectedImage.id, 'error', message);
      toast.error(`Error: ${message}`);
    }
  };

  const processBatch = async () => {
    const pendingImages = images.filter(img => img.status === 'pending');
    if (pendingImages.length === 0) {
      toast.info("No pending images to process");
      return;
    }

    setBatchStatus({ total: pendingImages.length, processed: 0, isActive: true });
    toast.info(`Initializing parallel processing for ${pendingImages.length} images...`);

    let completedCount = 0;

    const processUnit = async (img: ImageMetadata) => {
      try {
        updateImageStatus(img.id, 'processing');
        
        const response = await fetch(img.previewUrl);
        const blob = await response.blob();
        
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
        });
        reader.readAsDataURL(blob);
        const base64Data = await base64Promise;

        const metadata = await analyzeImage(base64Data, blob.type, marketplace, apiConfig.gemini);
        
        setImages(prev => prev.map(item => 
          item.id === img.id ? { ...item, status: 'completed', data: metadata } : item
        ));
      } catch (error) {
        console.error(`Error processing ${img.fileName}:`, error);
        updateImageStatus(img.id, 'error', error instanceof Error ? error.message : 'Analysis failed');
      } finally {
        completedCount++;
        setBatchStatus(prev => ({ ...prev, processed: completedCount }));
      }
    };

    // Run all processes in parallel
    await Promise.all(pendingImages.map(img => processUnit(img)));
    
    setBatchStatus(prev => ({ ...prev, isActive: false }));
    toast.success("All metadata reconstructed successfully");
  };

  const updateImageStatus = (id: string, status: ImageMetadata['status'], error?: string) => {
    setImages(prev => prev.map(img => 
      img.id === id ? { ...img, status, error } : img
    ));
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter(i => i.id !== id);
    });
    if (selectedImageId === id) setSelectedImageId(null);
  };

  const clearAll = () => {
    images.forEach(img => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setSelectedImageId(null);
  };

  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  
  const pendingImages = useMemo(() => images.filter(img => img.status !== 'completed'), [images]);
  const generatedImages = useMemo(() => images.filter(img => img.status === 'completed'), [images]);

  const downloadImagesZip = async () => {
    const completed = images.filter(img => img.status === 'completed');
    if (completed.length === 0) return toast.error('No processed images to download');

    const zip = new JSZip();
    toast.info("Preparing ZIP archive...");

    for (const img of completed) {
      try {
        const response = await fetch(img.previewUrl);
        const blob = await response.blob();
        zip.file(img.fileName, blob);
      } catch (e) {
        console.error(`Failed to add ${img.fileName} to zip`, e);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `images-metadata-pack-${new Date().getTime()}.zip`;
    link.click();
    toast.success("ZIP Archive Downloaded");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const exportCSV = () => {
    const completed = images.filter(img => img.status === 'completed' && img.data);
    if (completed.length === 0) return toast.error('No processed images to export');

    let headers: string[] = [];
    let rows: string[][] = [];

    // Marketplace specific formatting
    if (marketplace === StockMarketplace.ADOBE_STOCK) {
      headers = ['Filename', 'Title', 'Keywords', 'Category'];
      rows = completed.map(img => [
        img.fileName,
        `"${img.data!.title.replace(/"/g, '""')}"`,
        `"${img.data!.keywords.slice(0, 50).join(', ').replace(/"/g, '""')}"`,
        `"${img.data!.category}"`
      ]);
    } else if (marketplace === StockMarketplace.SHUTTERSTOCK) {
      headers = ['Filename', 'Description', 'Keywords', 'Categories'];
      rows = completed.map(img => [
        img.fileName,
        `"${img.data!.description.replace(/"/g, '""')}"`,
        `"${img.data!.keywords.slice(0, 50).join(', ').replace(/"/g, '""')}"`,
        `"${img.data!.category}"`
      ]);
    } else {
      // Default / Freepik
      headers = ['filename', 'title', 'description', 'keywords'];
      rows = completed.map(img => [
        img.fileName,
        `"${img.data!.title.replace(/"/g, '""')}"`,
        `"${img.data!.description.replace(/"/g, '""')}"`,
        `"${img.data!.keywords.join(',').replace(/"/g, '""')}"`
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `metadata-${marketplace}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success(`${marketplace.toUpperCase()} CSV Exported`);
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    multiple: true
  } as any);

  return (
    <TooltipProvider>
      <div className="layout-container">
        <Toaster position="top-right" theme="dark" richColors />
        
        {/* Navbar */}
        <header className="header-layout">
          <div className="container mx-auto flex items-center justify-between">
            <div className="nav-logo">
              <div className="nav-logo-box text-white">
                <Cpu className="w-6 h-6" />
              </div>
              <span className="nav-title ml-2">MR. METADETA</span>
            </div>
            
            <div className="flex items-center gap-4">
              <Sheet>
                <SheetTrigger className="p-2 text-slate-400 hover:text-slate-600 transition-colors outline-none cursor-pointer">
                  <Settings className="w-5 h-5" />
                </SheetTrigger>
                <SheetContent side="right" className="bg-white border-l border-slate-200">
                  <SheetHeader>
                    <SheetTitle className="text-slate-900 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-blue-500" />
                      Application Settings
                    </SheetTitle>
                    <SheetDescription>
                      Manage your API connection and preferences.
                    </SheetDescription>
                  </SheetHeader>
                  
                  <div className="mt-8 space-y-6">
                    <div className="space-y-6">
                      <div className="p-4 bg-slate-50 rounded-2xl space-y-6">
                        <div className="space-y-4">
                          <Label className="label-caps !mb-0">Core AI Engine</Label>
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-bold text-slate-600">Select Active Provider</Label>
                              <select 
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500 appearance-none cursor-pointer"
                                value={apiConfig.activeProvider}
                                onChange={(e) => setApiConfig(prev => ({ ...prev, activeProvider: e.target.value as any }))}
                              >
                                <option value="gemini">Google Gemini (Recommended)</option>
                                <option value="openai">OpenAI GPT-4o</option>
                                <option value="anthropic">Anthropic Claude 3.5</option>
                                <option value="mistral">Mistral Pixtral</option>
                                <option value="xai">xAI Grok</option>
                              </select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label className="text-xs text-slate-500">{apiConfig.activeProvider === 'gemini' ? "Google Gemini API Key" : apiConfig.activeProvider.toUpperCase() + " API Key"}</Label>
                              <input 
                                type="password" 
                                placeholder="sk-..."
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition-all font-mono"
                                value={apiConfig[apiConfig.activeProvider] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setApiConfig(prev => ({ ...prev, [prev.activeProvider]: val }));
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <Separator className="bg-slate-200" />

                        <div className="space-y-4">
                          <Label className="label-caps !mb-0">Alternative AI Engines (Optional)</Label>
                          <p className="text-[10px] text-slate-400 -mt-2">Connect other vision-capable LLMs for analysis</p>
                          
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-bold text-slate-600">OpenAI API Key (GPT-4o)</Label>
                              <input 
                                type="password" 
                                placeholder="sk-..." 
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500 transition-all font-mono" 
                                value={apiConfig.openai || ''}
                                onChange={(e) => setApiConfig(prev => ({ ...prev, openai: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-bold text-slate-600">Anthropic API Key (Claude 3.5)</Label>
                              <input 
                                type="password" 
                                placeholder="sk-ant-..." 
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-orange-500 transition-all font-mono" 
                                value={apiConfig.anthropic || ''}
                                onChange={(e) => setApiConfig(prev => ({ ...prev, anthropic: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-bold text-slate-600">Mistral AI Key (Pixtral)</Label>
                              <input 
                                type="password" 
                                placeholder="Mistral API Key" 
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-400 transition-all font-mono" 
                                value={apiConfig.mistral || ''}
                                onChange={(e) => setApiConfig(prev => ({ ...prev, mistral: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-bold text-slate-600">xAI Grok Key</Label>
                              <input 
                                type="password" 
                                placeholder="xai-..." 
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-slate-800 transition-all font-mono" 
                                value={apiConfig.xai || ''}
                                onChange={(e) => setApiConfig(prev => ({ ...prev, xai: e.target.value }))}
                              />
                            </div>
                          </div>
                        </div>

                        <Button 
                          className="w-full h-12 bg-slate-900 hover:bg-black text-white rounded-xl gap-2 font-bold transition-all shadow-lg shadow-black/10"
                          onClick={() => {
                            localStorage.setItem('lensmeta_api_config', JSON.stringify(apiConfig));
                            toast.success("All configurations synchronized");
                          }}
                        >
                          <Save className="w-4 h-4" /> Save All Keys
                        </Button>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <main className="main-layout flex-col lg:flex-row gap-6 p-6 overflow-hidden">
          
          {/* Left Column: Upload and Processing */}
          <aside className="w-full lg:w-[380px] flex flex-col gap-6 shrink-0">
            {/* Upload Zone */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="white-card p-6"
            >
              <div 
                {...getRootProps()} 
                className={cn(
                  "upload-zone relative transition-all duration-300",
                  isDragActive ? "bg-blue-100/50 border-blue-500 scale-[1.02]" : "bg-blue-50/30 border-blue-200",
                  pendingImages.length > 0 && !isDragActive ? "border-emerald-200 bg-emerald-50/20" : ""
                )}
              >
                <input {...getInputProps()} />
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-transform duration-500",
                  isDragActive ? "bg-blue-500 text-white scale-110" : "bg-blue-100 text-blue-600",
                  pendingImages.length > 0 && !isDragActive ? "bg-emerald-100 text-emerald-600" : ""
                )}>
                  <Upload className={cn("w-6 h-6", isDragActive && "animate-bounce")} />
                </div>
                
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-800">
                    {isDragActive ? "Drop images" : "Upload images"}
                  </p>
                  <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest font-bold">
                    {pendingImages.length > 0 ? `${pendingImages.length} In Queue` : "Ready"}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Marketplace Selection */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="white-card p-4"
            >
              <Label className="label-caps !mb-3">Target Marketplace</Label>
              <div className="flex gap-3 justify-between">
                {[
                  { id: StockMarketplace.ADOBE_STOCK, name: 'Adobe Stock', icon: '5968454.png' },
                  { id: StockMarketplace.SHUTTERSTOCK, name: 'Shutterstock', icon: '174868.png' },
                  { id: StockMarketplace.FREEPIK, name: 'Freepik', icon: '14649028.png' }
                ].map(p => (
                  <motion.div 
                    whileHover={{ y: -2, scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    key={p.id}
                    onClick={() => setMarketplace(p.id)}
                    className={cn(
                      "w-10 h-10 rounded-lg border-2 p-1 bg-white flex items-center justify-center transition-all cursor-pointer shadow-sm relative group",
                      marketplace === p.id ? "border-blue-500 shadow-md ring-2 ring-blue-50" : "border-slate-100 hover:border-slate-300"
                    )}
                  >
                    <img 
                      referrerPolicy="no-referrer"
                      src={p.icon} 
                      className={cn("w-full h-full object-contain", marketplace !== p.id && "grayscale opacity-50")} 
                      alt={p.name} 
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Queue */}
            <div className="flex-1 flex flex-col min-h-0">
               <div className="flex items-center justify-between mb-2 px-2">
                 <Label className="label-caps">Processing Queue</Label>
                 <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 rounded-full">
                   {pendingImages.length} Remaining
                 </span>
               </div>
               
               {pendingImages.some(img => img.status === 'pending') && !batchStatus.isActive && (
                 <Button 
                   className="mb-4 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 gap-2 shadow-sm font-bold text-xs"
                   onClick={processBatch}
                   disabled={images.some(img => img.status === 'processing')}
                 >
                   <Sparkles className="w-4 h-4" />
                   Start Batch Generation
                 </Button>
               )}

               {batchStatus.isActive && (
                 <div className="mb-4 p-4 bg-white rounded-xl border border-blue-100 shadow-sm space-y-3">
                   <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                     <span className="flex items-center gap-1">
                       <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                       Processing...
                     </span>
                     <span className="text-blue-600">
                       {batchStatus.processed} / {batchStatus.total}
                     </span>
                   </div>
                   <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                     <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: `${(batchStatus.processed / batchStatus.total) * 100}%` }}
                       className="h-full bg-blue-500"
                     />
                   </div>
                 </div>
               )}

               <ScrollArea className="flex-1">
                 <div className="flex flex-col gap-2 p-1">
                   <AnimatePresence>
                   {pendingImages.map(img => (
                      <motion.div 
                        key={img.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8, x: 50 }}
                        className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100 shadow-sm group"
                      >
                       <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-slate-50">
                         <img src={img.previewUrl} className="w-full h-full object-cover" alt="Thumb" />
                       </div>
                       <div className="flex-1 min-w-0">
                         <p className="text-[10px] font-bold text-slate-800 truncate">{img.fileName}</p>
                         <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn("text-[8px] font-bold uppercase", 
                             img.status === 'processing' ? "text-blue-500" : "text-slate-400")}>
                              {img.status}
                            </span>
                         </div>
                       </div>
                      </motion.div>
                   ))}
                   </AnimatePresence>
                 </div>
               </ScrollArea>
            </div>
          </aside>

          {/* Right Column: Generated Metadata */}
          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <Database className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Generated Assets</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">{generatedImages.length} Files Processed</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={clearAll}
                  disabled={generatedImages.length === 0}
                  variant="outline"
                  className="border-slate-200 text-slate-500 h-9 px-4 rounded-xl text-xs font-bold gap-2 hover:bg-slate-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> CLEAR ALL
                </Button>
                <Button 
                  onClick={exportCSV}
                  disabled={generatedImages.length === 0}
                  className="bg-slate-900 hover:bg-black text-white h-9 px-4 rounded-xl text-xs font-bold gap-2"
                >
                  <FileJson className="w-3.5 h-3.5" /> EXPORT CSV
                </Button>
                <Button 
                  onClick={downloadImagesZip}
                  disabled={generatedImages.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 rounded-xl text-xs font-bold gap-2"
                >
                  <Download className="w-3.5 h-3.5" /> DOWNLOAD IMAGES (ZIP)
                </Button>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="flex-1 min-h-0 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-4 relative overflow-hidden">
              <ScrollArea className="h-full">
                {generatedImages.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 pb-20">
                    <AnimatePresence>
                      {generatedImages.map(img => (
                        <motion.div
                          key={img.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm group hover:shadow-md transition-all"
                        >
                          <div className="flex gap-4">
                            <div className="w-32 h-32 rounded-lg overflow-hidden shrink-0 shadow-inner">
                              <img src={img.previewUrl} className="w-full h-full object-cover" alt="Processed" />
                            </div>
                            <div className="flex-1 space-y-3 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1 min-w-0 flex-1">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{img.fileName}</p>
                                  <h4 className="text-sm font-bold text-slate-800 break-words line-clamp-2">
                                    {img.data?.title || "Untitled Asset"}
                                  </h4>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-500" onClick={() => copyToClipboard(img.data?.title + "\n" + img.data?.description + "\n" + img.data?.keywords.join(", "))}>
                                        <Copy className="w-3.5 h-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Copy All Metadata</TooltipContent>
                                  </Tooltip>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-500" onClick={() => setEditingImageId(img.id)}>
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500" onClick={() => removeImage(img.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                              
                              <p className="text-xs text-slate-500 break-words leading-relaxed">
                                {img.data?.description}
                              </p>

                              <div className="flex flex-wrap gap-1.5 pt-2 max-w-full overflow-hidden">
                                {img.data?.keywords.slice(0, 50).map((tag, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-slate-50 text-slate-500 text-[10px] rounded-md border border-slate-100 break-all">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                    <Layout className="w-12 h-12 text-slate-300 mb-4" />
                    <p className="text-sm font-medium text-slate-400">Processed assets will appear here</p>
                  </div>
                )}
              </ScrollArea>

              {/* Thank You Card */}
              <div className="absolute bottom-4 left-4 right-4 pointer-events-none flex justify-center">
                <motion.div 
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="white-card px-8 py-3 shadow-2xl border-blue-500/20 bg-blue-50/50 backdrop-blur-md pointer-events-auto"
                >
                  <p className="text-xs font-bold text-blue-600 tracking-widest text-center">
                    THANK YOU FOR USING OUR TOOL
                  </p>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Edit Modal / Floating Overlay */}
          <AnimatePresence>
            {editingImageId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                  onClick={() => setEditingImageId(null)}
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden z-10 p-8 space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <Edit2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-800">Refine Metadata</h3>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setEditingImageId(null)}>
                      <X className="w-5 h-5" />
                    </Button>
                  </div>

                  {images.find(i => i.id === editingImageId) && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="label-caps">Title</Label>
                        <input 
                          className="input-field"
                          value={images.find(i => i.id === editingImageId)?.data?.title || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setImages(prev => prev.map(img => 
                              img.id === editingImageId ? { ...img, data: { ...img.data!, title: val } } : img
                            ));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="label-caps">Description</Label>
                        <textarea 
                          className="input-field min-h-[120px] resize-none"
                          value={images.find(i => i.id === editingImageId)?.data?.description || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setImages(prev => prev.map(img => 
                              img.id === editingImageId ? { ...img, data: { ...img.data!, description: val } } : img
                            ));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="label-caps">Keywords (Comma Separated)</Label>
                        <textarea 
                          className="input-field min-h-[100px] resize-none"
                          value={images.find(i => i.id === editingImageId)?.data?.keywords.join(", ") || ""}
                          onChange={(e) => {
                            const val = e.target.value.split(",").map(s => s.trim()).filter(s => s);
                            setImages(prev => prev.map(img => 
                              img.id === editingImageId ? { ...img, data: { ...img.data!, keywords: val } } : img
                            ));
                          }}
                        />
                      </div>
                      <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-bold"
                        onClick={() => setEditingImageId(null)}
                      >
                        Save Changes
                      </Button>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </main>

        <footer className="footer-layout justify-center py-4">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            MR. METADETA • SECURE AI PIPELINE
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
