import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Search, Plus, Trash2, ExternalLink, Download, Layers, 
  Sparkles, AlertCircle, Check, HelpCircle, X, ArrowLeft, ArrowRight, 
  Upload, Link, GripVertical, Cloud, Folder, RefreshCw, Loader2, Shield
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { DatabaseState, PdfItem, Subtopic, Topic, CustomUser } from '../types';

interface AllPdfsViewProps {
  dbState: DatabaseState;
  onOpenSubtopic: (topicId: string, subtopicId: string) => void;
  onUpdateDb: (updates: Partial<DatabaseState>) => void;
  onSelectView?: (view: string) => void;
  currentUser: CustomUser;
}

const GDRIVE_TOKEN_KEY = 'vault_gdrive_access_token_v1';

export function AllPdfsView({ dbState, onOpenSubtopic, onUpdateDb, onSelectView, currentUser }: AllPdfsViewProps) {
  const { topics, subtopics } = dbState;
  const pdfs = dbState.pdfs || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');

  // Drag and drop states for manual PDF reordering
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Google Drive Credentials state
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(GDRIVE_TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Pop-up Wizard states (condensed 2-step flow)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // 1 or 2
  const [pdfType, setPdfType] = useState<'upload' | 'link' | 'url'>('upload');
  const [formTitle, setFormTitle] = useState('');
  const [formFileName, setFormFileName] = useState('');
  const [formFileSize, setFormFileSize] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formSubtopicId, setFormSubtopicId] = useState('');
  
  // Selected local file for drive upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [base64FileContent, setBase64FileContent] = useState<string>('');
  
  // Google Drive file explorer items
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [driveSearching, setDriveSearching] = useState(false);
  const [driveSearchQuery, setDriveSearchQuery] = useState('');
  const [selectedDriveFile, setSelectedDriveFile] = useState<any | null>(null);

  // Dedicated Drive picker states
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSubtopicId, setPickerSubtopicId] = useState('');
  const [drivePickerFiles, setDrivePickerFiles] = useState<any[]>([]);
  const [isPickerSearching, setIsPickerSearching] = useState(false);
  const [pickerSelectedFile, setPickerSelectedFile] = useState<any | null>(null);
  const [pickerError, setPickerError] = useState('');

  const [formEnableLinkedNote, setFormEnableLinkedNote] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploadingToDrive, setUploadingToDrive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize Google token across components
  const updateToken = (newToken: string | null) => {
    setToken(newToken);
    try {
      if (newToken) {
        localStorage.setItem(GDRIVE_TOKEN_KEY, newToken);
      } else {
        localStorage.removeItem(GDRIVE_TOKEN_KEY);
      }
    } catch (e) {
      console.error("Local storage token sync failure:", e);
    }
  };

  const handleConnectGoogle = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      if (accessToken) {
        updateToken(accessToken);
      } else {
        setAuthError("Could not retrieve a valid Google Drive scope session.");
      }
    } catch (err: any) {
      console.error("Popup authentication error:", err);
      setAuthError(err.message || "Google Authentication flow aborted.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleDisconnectGoogle = () => {
    updateToken(null);
    setDriveFiles([]);
    setSelectedDriveFile(null);
  };

  // Fetch documents from user's connected Google Drive
  const fetchDriveFiles = async (searchQueryString = '') => {
    if (!token) return;
    setDriveSearching(true);
    try {
      const response = await fetch(`/api/drive/list?search=${encodeURIComponent(searchQueryString)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 401 || response.status === 403) {
        updateToken(null);
        return;
      }
      const data = await response.json();
      if (data.success) {
        setDriveFiles(data.files || []);
      }
    } catch (err) {
      console.error("Failed fetching Google Drive document catalogs:", err);
    } finally {
      setDriveSearching(false);
    }
  };

  // Retrieve files when token changes or search query updates
  useEffect(() => {
    if (token && isModalOpen && pdfType === 'link') {
      const debounceTimer = setTimeout(() => {
        fetchDriveFiles(driveSearchQuery);
      }, 400);
      return () => clearTimeout(debounceTimer);
    }
  }, [token, isModalOpen, pdfType, driveSearchQuery]);

  const fetchPickerDriveFiles = async (query = '') => {
    if (!token) return;
    setIsPickerSearching(true);
    setPickerError('');
    try {
      const response = await fetch(`/api/drive/list?search=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 401 || response.status === 403) {
        updateToken(null);
        setPickerError("Session expired. Please reconnect to Google Drive.");
        return;
      }
      const data = await response.json();
      if (data.success) {
        setDrivePickerFiles(data.files || []);
      } else {
        setPickerError(data.error || "Failed to search Google Drive files.");
      }
    } catch (err: any) {
      console.error("Failed fetching Google Drive files for picker:", err);
      setPickerError("Sync connection error. Trace network files.");
    } finally {
      setIsPickerSearching(false);
    }
  };

  useEffect(() => {
    if (token && isDrivePickerOpen) {
      const debounceTimer = setTimeout(() => {
        fetchPickerDriveFiles(pickerSearch);
      }, 400);
      return () => clearTimeout(debounceTimer);
    }
  }, [token, isDrivePickerOpen, pickerSearch]);

  const handlePickerImportSubmit = () => {
    setPickerError('');
    if (!pickerSelectedFile) {
      setPickerError('Please select a file from your Google Drive list.');
      return;
    }
    if (!pickerSubtopicId) {
      setPickerError('Please associate a target syllabus Subtopic index.');
      return;
    }

    const exists = pdfs.some(p => p.driveFileId === pickerSelectedFile.id);
    if (exists) {
      setPickerError('This file is already connected as a PDF reference document.');
      return;
    }

    const cleanTitle = pickerSelectedFile.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    const formattedSize = pickerSelectedFile.size 
      ? (parseInt(pickerSelectedFile.size) > 1024 * 1024 
          ? `${(parseInt(pickerSelectedFile.size) / (1024 * 1024)).toFixed(1)} MB` 
          : `${(parseInt(pickerSelectedFile.size) / 1024).toFixed(0)} KB`)
      : 'Drive Resource';

    const newPdf: PdfItem = {
      id: `drive-picked-${Date.now()}`,
      subtopicId: pickerSubtopicId,
      title: cleanTitle,
      fileName: pickerSelectedFile.name,
      fileSize: formattedSize,
      driveFileId: pickerSelectedFile.id,
      url: pickerSelectedFile.webViewLink || "",
      createdAt: new Date().toISOString(),
      isReading: false,
      isCompleted: false,
      status: 'unseen'
    };

    onUpdateDb({ pdfs: [...pdfs, newPdf] });
    setIsDrivePickerOpen(false);
    setPickerSelectedFile(null);
    setPickerSearch('');
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId !== id) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const sourceIdx = pdfs.findIndex(p => p.id === draggedId);
    const targetIdx = pdfs.findIndex(p => p.id === targetId);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      const updated = [...pdfs];
      const [movedItem] = updated.splice(sourceIdx, 1);
      updated.splice(targetIdx, 0, movedItem);
      onUpdateDb({ pdfs: updated });
    }

    setDraggedId(null);
    setDragOverId(null);
  };

  const handleOpenAddModal = () => {
    setFormTitle('');
    setFormFileName('');
    setFormFileSize('');
    setFormUrl('');
    setFormSubtopicId('');
    setSelectedFile(null);
    setBase64FileContent('');
    setSelectedDriveFile(null);
    setFormEnableLinkedNote(false);
    setPdfType(token ? 'upload' : 'url');
    setFormError('');
    setCurrentStep(1);
    setIsModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFormFileName(file.name);
      
      const estimated = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${(file.size / 1024).toFixed(0)} KB`;
      setFormFileSize(estimated);

      if (!formTitle) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
        setFormTitle(cleanName);
      }
      setFormError('');

      // Convert to Base64 ready for upload to Google Drive proxy
      const reader = new FileReader();
      reader.onloadend = () => {
        setBase64FileContent(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (pdfType === 'upload') {
        if (!selectedFile) {
          setFormError('Please choose a file to upload & sync to Google Drive.');
          return;
        }
        if (!formTitle.trim()) {
          setFormError('Please enter a document reference title.');
          return;
        }
      } else if (pdfType === 'link') {
        if (!selectedDriveFile) {
          setFormError('Please select an active Google Drive document card from the catalog list.');
          return;
        }
        if (!formTitle.trim()) {
          setFormError('Please enter a document reference title.');
          return;
        }
      } else if (pdfType === 'url') {
        if (!formUrl.trim()) {
          setFormError('Please enter a valid curriculum web address/hyperlink.');
          return;
        }
        if (!formTitle.trim()) {
          setFormError('Please enter a reference title.');
          return;
        }
      }

      setFormError('');
      setCurrentStep(2);
    }
  };

  const handlePrevStep = () => {
    setFormError('');
    if (currentStep > 1) {
      setCurrentStep(1);
    }
  };

  // Build high-concept folder sync upload
  const handleAddPdfItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formTitle.trim()) {
      setFormError('Please enter a document reference title.');
      return;
    }
    if (!formSubtopicId) {
      setFormError('Please associate with connected subtopic segment.');
      return;
    }

    const sub = subtopics.find(s => s.id === formSubtopicId);
    const topic = sub ? topics.find(t => t.id === sub.topicId) : null;
    const topicName = topic ? topic.name : "Core Syllabus Concepts";
    const subtopicName = sub ? sub.name : "Associated Specs";

    if (pdfType === 'upload') {
      if (!selectedFile || !base64FileContent) {
        setFormError('Selected document content is missing. Re-select the file.');
        return;
      }
      if (!token) {
        setFormError('Google Drive session is inactive. Authorize connection first.');
        return;
      }

      setUploadingToDrive(true);
      try {
        const uploadResponse = await fetch('/api/drive/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: currentUser.name || 'StudentUser',
            topicName: topicName,
            subtopicName: subtopicName,
            name: formFileName || selectedFile.name,
            mimeType: selectedFile.type || 'application/pdf',
            base64Data: base64FileContent,
            description: `Reference for Subtopic: ${subtopicName}`
          })
        });

        if (!uploadResponse.ok) {
          if (uploadResponse.status === 401 || uploadResponse.status === 403) {
            updateToken(null);
            throw new Error("Google access token has expired or is blocked. Please reconnect.");
          }
          const rawErr = await uploadResponse.json();
          throw new Error(rawErr.error || "Google Drive file sync failed.");
        }

        const dataRes = await uploadResponse.json();
        const driveId = dataRes.file.id;

        const newItem: PdfItem = {
          id: `pdf-${Date.now()}`,
          subtopicId: formSubtopicId,
          title: formTitle.trim(),
          fileName: selectedFile.name,
          fileSize: formFileSize,
          driveFileId: driveId,
          createdAt: new Date().toISOString(),
          enableLinkedNote: formEnableLinkedNote
        };

        onUpdateDb({ pdfs: [...pdfs, newItem] });
        setIsModalOpen(false);

      } catch (err: any) {
        console.error("Drive upload handler error:", err);
        setFormError(err.message || "Failed to persist document to structured Google Drive folder.");
      } finally {
        setUploadingToDrive(false);
      }

    } else if (pdfType === 'link') {
      if (!selectedDriveFile) {
        setFormError('Please select a file to link.');
        return;
      }

      const formattedSize = selectedDriveFile.size 
        ? (parseInt(selectedDriveFile.size) > 1024 * 1024 
            ? `${(parseInt(selectedDriveFile.size) / (1024 * 1024)).toFixed(1)} MB` 
            : `${(parseInt(selectedDriveFile.size) / 1024).toFixed(0)} KB`)
        : 'Drive Resource';

      const newItem: PdfItem = {
        id: `pdf-${Date.now()}`,
        subtopicId: formSubtopicId,
        title: formTitle.trim(),
        fileName: selectedDriveFile.name || 'synced_file',
        fileSize: formattedSize,
        driveFileId: selectedDriveFile.id,
        createdAt: new Date().toISOString(),
        enableLinkedNote: formEnableLinkedNote
      };

      onUpdateDb({ pdfs: [...pdfs, newItem] });
      setIsModalOpen(false);

    } else {
      // URL tab submission
      const newItem: PdfItem = {
        id: `pdf-${Date.now()}`,
        subtopicId: formSubtopicId,
        title: formTitle.trim(),
        fileName: formFileName.trim() || 'reference_web_link.pdf',
        fileSize: 'Public URL',
        url: formUrl.trim(),
        createdAt: new Date().toISOString(),
        enableLinkedNote: formEnableLinkedNote
      };

      onUpdateDb({ pdfs: [...pdfs, newItem] });
      setIsModalOpen(false);
    }
  };

  const handleOpenPdfFile = (item: PdfItem) => {
    if (item.driveFileId) {
      if (!token) {
        alert("Please connect Google Drive first to securely fetch and view this document.");
        return;
      }
      window.open(`/api/drive/file/${item.driveFileId}?token=${encodeURIComponent(token)}`, '_blank');
    } else if (item.url) {
      window.open(item.url, '_blank');
    } else if (item.fileData) {
      // Safe fallback download for legacy items
      const link = document.createElement('a');
      link.href = item.fileData;
      link.download = item.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const triggerLinkedNote = (resourceId: string, resourceTitle: string, resourceType: 'pdf' | 'assignment' | 'book' | 'video') => {
    const quickNotes = dbState.quickNotes || [];
    const existingNote = quickNotes.find(q => q.linkedResourceId === resourceId && q.linkedResourceType === resourceType);
    
    if (existingNote) {
      localStorage.setItem('target_quick_note_id', existingNote.id);
    } else {
      const newNoteId = `qnote-${Date.now()}`;
      const newNote = {
        id: newNoteId,
        title: `Note: ${resourceTitle}`,
        content: `<div><strong>Linked Resource:</strong> <span style="background-color: #fef08a; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: black; font-family: monospace;">${resourceType.toUpperCase()}: ${resourceTitle}</span></div><br><div>Start typing your notes about this ${resourceType}...</div>`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPinned: true,
        isFavorite: false,
        color: '#fbbf24',
        linkedResourceId: resourceId,
        linkedResourceType: resourceType,
        linkedResourceTitle: resourceTitle
      };
      onUpdateDb({ quickNotes: [newNote, ...quickNotes] });
      localStorage.setItem('target_quick_note_id', newNoteId);
    }
    
    if (onSelectView) {
      onSelectView('quicknotes');
    }
  };

  const getSubtopicPath = (subtopicId: string) => {
    const sub = subtopics.find(s => s.id === subtopicId);
    const topic = sub ? topics.find(t => t.id === sub.topicId) : null;
    return { sub, topic };
  };

  const handleDeleteItem = (itemId: string) => {
    const updated = pdfs.filter(p => p.id !== itemId);
    onUpdateDb({ pdfs: updated });
  };

  const markPdfAsReading = (pdfId: string) => {
    const updated = pdfs.map(p => {
      if (p.id === pdfId) {
        return {
          ...p,
          isReading: true,
          lastOpenedAt: new Date().toISOString(),
          status: (p.status === 'completed' ? 'completed' : 'reading') as 'unseen' | 'reading' | 'completed' | 'revision'
        };
      }
      return { ...p, isReading: false };
    });
    onUpdateDb({ pdfs: updated });
  };

  const updatePdfStatus = (pdfId: string, status: 'unseen' | 'reading' | 'completed' | 'revision') => {
    const updated = pdfs.map(p => {
      if (p.id === pdfId) {
        return {
          ...p,
          status,
          isCompleted: status === 'completed',
          needsRevision: status === 'revision',
          isReading: status === 'completed' ? false : p.isReading
        };
      }
      return p;
    });
    onUpdateDb({ pdfs: updated });
  };

  // Filter pdf items
  const filteredPdfs = pdfs.filter(p => {
    const { sub, topic } = getSubtopicPath(p.subtopicId);
    const query = searchTerm.toLowerCase();

    const matchesQuery = p.title.toLowerCase().includes(query) ||
      p.fileName.toLowerCase().includes(query) ||
      (p.url?.toLowerCase().includes(query) ?? false) ||
      (sub?.name.toLowerCase().includes(query) ?? false) ||
      (topic?.name.toLowerCase().includes(query) ?? false);

    const matchesTopic = selectedTopicId === 'all' || (sub?.topicId === selectedTopicId);

    return matchesQuery && matchesTopic;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200 text-left">
      
      {/* Header section with inline CTA */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-404 dark:text-slate-500 uppercase tracking-widest font-mono">
            Structured Cloud Vault
          </p>
          <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mt-1 tracking-tight flex items-center gap-2.5">
            <Cloud className="w-8 h-8 text-blue-500 shrink-0" />
            <span>Curriculum References & Whitepapers</span>
          </h2>
          <p className="text-sm font-medium text-slate-555 dark:text-slate-400 mt-2 font-sans max-w-3xl">
            Stream, link, and upload specification sheets, reference guides, or books to structured Google Drive folder directories organized perfectly by your study topics and curriculum paths.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-center">
          {token ? (
            <>
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 px-3.5 py-2 rounded-xl">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping shrink-0" />
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-450 font-sans">Drive Connected</span>
                <button 
                  onClick={handleDisconnectGoogle}
                  className="text-[10px] underline font-bold text-slate-400 hover:text-red-500 ml-1 transition-colors cursor-pointer"
                >
                  Disconnect
                </button>
              </div>

              <button
                onClick={() => {
                  setIsDrivePickerOpen(true);
                  setPickerSearch('');
                  setPickerSelectedFile(null);
                  setPickerSubtopicId('');
                  setPickerError('');
                }}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Cloud className="w-4 h-4 text-white animate-pulse" />
                <span>Drive File Picker</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleConnectGoogle}
              disabled={isAuthLoading}
              className="px-4 py-2 border border-slate-202 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isAuthLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Shield className="w-3.5 h-3.5 text-blue-500" />
              )}
              <span>Connect Drive</span>
            </button>
          )}

          <button
            onClick={handleOpenAddModal}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-555 text-white text-xs font-black rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Add PDF Reference</span>
          </button>
        </div>
      </div>

      {authError && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-405 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4.5 h-4.5 text-rose-500 shrink-0" />
          <span>{authError}</span>
        </div>
      )}

      {/* Control Actions toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-202 dark:border-slate-850 shadow-3xs">
        {/* Search */}
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-404" />
          <input
            type="text"
            placeholder="Search reference books, filenames, bookmarks, academic category paths..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 rounded-xl text-sm placeholder-slate-404 outline-none focus:border-blue-500 font-sans text-slate-900 dark:text-white"
          />
        </div>

        {/* Filters */}
        <div className="w-full sm:w-auto flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-405 shrink-0" />
          <select
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 border border-slate-202 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl text-xs outline-none text-slate-700 dark:text-slate-300 focus:border-blue-500 font-sans"
          >
            <option value="all">All Topics (Default)</option>
            {topics.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main files rendering grid stack */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
         {filteredPdfs.map(item => {
          const { sub, topic } = getSubtopicPath(item.subtopicId);
          const isReading = !!item.isReading;
          const status = item.status || 'unseen';

          // Decide border and background styles based on learning status
          let cardStyles = "border-slate-202 dark:border-slate-850 bg-white dark:bg-slate-900";
          let statusBadge = null;

          if (isReading) {
            cardStyles = "border-amber-400 dark:border-amber-500 ring-4 ring-amber-400/25 dark:ring-amber-950/40 shadow-[0_10px_35px_rgba(245,158,11,0.18)] bg-gradient-to-tr from-orange-50/50 via-amber-50/30 to-rose-50/50 dark:from-orange-950/10 dark:via-amber-950/15 dark:to-rose-950/10";
          } else if (status === 'completed' || item.isCompleted) {
            cardStyles = "border-emerald-250 dark:border-emerald-900/60 bg-emerald-500/[0.005] dark:bg-emerald-950/[0.005]";
          } else if (status === 'revision' || item.needsRevision) {
            cardStyles = "border-indigo-250 dark:border-indigo-900/65 bg-indigo-500/[0.005] dark:bg-indigo-950/[0.005]";
          } else if (status === 'reading') {
            cardStyles = "border-amber-200 dark:border-amber-900/60 bg-amber-500/[0.005] dark:bg-amber-950/[0.005]";
          }

          switch (status) {
            case 'completed':
              statusBadge = <span className="text-[9px] font-black text-emerald-600 bg-emerald-100/60 dark:text-emerald-400 dark:bg-emerald-955/20 px-1.5 py-0.5 rounded">🎉 DONE</span>;
              break;
            case 'revision':
              statusBadge = <span className="text-[9px] font-black text-indigo-600 bg-indigo-100/60 dark:text-indigo-400 dark:bg-indigo-955/25 px-1.5 py-0.5 rounded">🔄 REVISE</span>;
              break;
            case 'reading':
              statusBadge = <span className="text-[9px] font-black text-amber-600 bg-amber-100/60 dark:text-amber-400 dark:bg-amber-955/20 px-1.5 py-0.5 rounded">📖 READING</span>;
              break;
            default:
              statusBadge = <span className="text-[9px] font-black text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-800 px-1.5 py-0.5 rounded">⏳ UNREAD</span>;
          }

          return (
            <div 
              key={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, item.id)}
              onDragEnd={handleDragEnd}
              onClick={() => markPdfAsReading(item.id)}
              className={`border rounded-2xl p-5 relative flex flex-col justify-between gap-4 transition-all hover:border-blue-400 dark:hover:border-slate-700 shadow-3xs text-left cursor-grab active:cursor-grabbing ${cardStyles} ${
                draggedId === item.id 
                  ? 'opacity-40 border-dashed border-blue-500 dark:border-blue-400 scale-95 shadow-sm bg-slate-50/50 dark:bg-slate-950/40' 
                  : ''
              } ${
                dragOverId === item.id 
                  ? 'border-blue-500 dark:border-blue-400 scale-102 ring-2 ring-blue-500/20 bg-blue-50/10 dark:bg-blue-950/15' 
                  : ''
              }`}
            >
              {/* Playful watercolor blend blobs inside active reading card */}
              {isReading && (
                <>
                  <div className="absolute -right-4 -top-4 w-32 h-32 bg-gradient-to-r from-amber-400/30 dark:from-amber-300/20 via-pink-400/10 to-transparent rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-gradient-to-r from-yellow-400/20 dark:from-yellow-300/10 via-amber-300/5 to-transparent rounded-full blur-2xl pointer-events-none" />
                </>
              )}

              {/* Top metadata row */}
              <div className="space-y-2 relative z-10">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0 cursor-grab hover:text-slate-600 dark:hover:text-slate-300" />
                    {sub && topic ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSubtopic(topic.id, sub.id);
                        }}
                        className="inline-flex items-center gap-1.5 text-slate-550 hover:text-blue-650 text-[10px] font-bold font-mono tracking-wide truncate transition-colors cursor-pointer dark:hover:text-blue-450"
                      >
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: topic.color }} />
                        <span>{topic.name}</span>
                        <span className="text-slate-404 font-sans">➔</span>
                        <span className="underline truncate">{sub.name}</span>
                      </button>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-mono">Attachment</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {statusBadge}
                    {isReading && (
                      <span className="inline-flex items-center gap-1 text-[8.5px] font-black tracking-wider text-amber-700 bg-amber-500/20 dark:text-amber-300 dark:bg-amber-500/25 px-2 py-0.5 rounded animate-pulse shadow-sm">
                        <Sparkles className="w-2.5 h-2.5 text-amber-650 dark:text-amber-400 animate-spin" />
                        <span>READING NOW</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* File Title and Filename */}
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white leading-snug line-clamp-2">
                  {item.title}
                </h4>

                <div className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border dark:border-slate-805 flex items-center justify-between gap-2">
                  <span className="truncate flex items-center gap-1.5 font-sans font-medium">
                    {item.driveFileId ? (
                      <Cloud className="w-3.5 h-3.5 text-blue-500" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span className="truncate">{item.fileName}</span>
                  </span>
                  {item.driveFileId && (
                    <span className={`text-[9px] font-bold shrink-0 px-1.5 py-0.2 rounded-full ${token ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-650 dark:text-red-400'}`} title={token ? "Linked & Synced with Drive" : "Sync Error: Drive Access Disconnected"}>
                      {token ? "synced" : "error"}
                    </span>
                  )}
                  <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">{item.fileSize}</span>
                </div>
              </div>

              {/* Status Switcher segment */}
              <div className="flex items-center justify-between pb-1 pt-1 border-t border-b border-slate-100/60 dark:border-slate-805/60">
                <span className="text-[9px] font-bold text-slate-400 font-mono uppercase">Status Selector:</span>
                <div className="inline-flex bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); updatePdfStatus(item.id, 'unseen'); }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all ${
                      status === 'unseen'
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-3xs font-black'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Unread
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); updatePdfStatus(item.id, 'reading'); }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all ${
                      status === 'reading'
                        ? 'bg-amber-500 text-white shadow-3xs font-black'
                        : 'text-slate-400 hover:text-amber-550'
                    }`}
                  >
                    Read
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); updatePdfStatus(item.id, 'completed'); }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all ${
                      status === 'completed'
                        ? 'bg-emerald-600 text-white shadow-3xs font-black'
                        : 'text-slate-400 hover:text-emerald-555'
                    }`}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); updatePdfStatus(item.id, 'revision'); }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all ${
                      status === 'revision'
                        ? 'bg-indigo-600 text-white shadow-3xs font-black'
                        : 'text-slate-400 hover:text-indigo-505'
                    }`}
                  >
                    Revise
                  </button>
                </div>
              </div>

              {/* Interaction actions */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markPdfAsReading(item.id);
                      handleOpenPdfFile(item);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-sans text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                    title={item.driveFileId ? "Stream securely from Google Drive" : "Open external link"}
                  >
                    {item.driveFileId ? (
                      <>
                        <Cloud className="w-3.5 h-3.5" />
                        <span>Stream from Drive</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Document</span>
                      </>
                    )}
                  </button>

                  {item.enableLinkedNote && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerLinkedNote(item.id, item.title, 'pdf');
                      }}
                      className="inline-flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-sans text-[10px] font-extrabold rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer border border-amber-500/20"
                      title="Open connected study note"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0 inline-block" />
                      <span>📝 Quick Note</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const updated = pdfs.map(p => p.id === item.id ? { ...p, enableLinkedNote: !p.enableLinkedNote } : p);
                      onUpdateDb({ pdfs: updated });
                    }}
                    className={`p-1 rounded-lg transition-colors cursor-pointer ${item.enableLinkedNote ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20' : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title={item.enableLinkedNote ? "Unlink Connected Note" : "Link Connected Note"}
                  >
                    <span className="text-[10px] font-extrabold leading-none">🔗</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteItem(item.id);
                    }}
                    className="p-1.5 text-slate-404 hover:text-red-500 rounded-lg hover:bg-slate-55 dark:hover:bg-slate-805 transition-colors cursor-pointer"
                    title="Remove reference bookmark"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredPdfs.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-205 dark:border-slate-855 rounded-3xl bg-slate-50/10 animate-fade-in">
            <AlertCircle className="w-10 h-10 text-slate-450 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-sans font-medium text-sm">
              No attached documents, specifications or PDF bookmarks match selected parameters.
            </p>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Add a document bookmark above or load individual study topics inside.
            </p>
          </div>
        )}
      </div>

      {/* Pop-up Reference Wizard Modal (3-Tab Dynamic Selector flow) */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-100"
        >
          {/* Modal box body */}
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
          >
            {/* Modal header details */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Cloud className="w-5 h-5 text-blue-500 shrink-0" />
                  <span>Curriculum Reference Sync Wizard</span>
                </h3>
                <p className="text-xs text-slate-404 font-medium">Link specifications, whitepapers, or ebooks to curriculum subtopics</p>
              </div>

              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-404 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Step progress indicators */}
            <div className="flex items-center justify-center gap-1.5 mb-5 shrink-0">
              {[1, 2].map(stepNum => (
                <div key={stepNum} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs transition-all ${
                    currentStep === stepNum
                      ? 'bg-blue-600 text-white shadow-xs scale-105'
                      : currentStep > stepNum
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/45'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}>
                    {stepNum === 1 ? '1: Ref Source' : '2: Syllabus Link'}
                  </div>
                  {stepNum < 2 && (
                    <div className={`w-12 h-0.5 mx-1 transition-colors ${currentStep > stepNum ? 'bg-blue-500' : 'bg-slate-100 dark:bg-slate-800'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Mode selection tabs during Step 1 */}
            {currentStep === 1 && (
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl mb-4 shrink-0">
                <button
                  type="button"
                  onClick={() => { setPdfType('upload'); setFormError(''); }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${pdfType === 'upload' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-3xs' : 'text-slate-404 hover:text-slate-600'}`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload to Drive</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setPdfType('link'); setFormError(''); }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${pdfType === 'link' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-3xs' : 'text-slate-404 hover:text-slate-600'}`}
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>Link from Drive</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setPdfType('url'); setFormError(''); }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${pdfType === 'url' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-3xs' : 'text-slate-404 hover:text-slate-600'}`}
                >
                  <Link className="w-3.5 h-3.5" />
                  <span>Web URL</span>
                </button>
              </div>
            )}

            {/* Error alerts */}
            {formError && (
              <div className="flex items-center gap-2 p-3.5 bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300 text-xs font-semibold rounded-2xl border border-rose-105 dark:border-rose-900/30 mb-4 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Scrollable Form Workspace */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-[220px]">
              
              {/* STEP 1: Main payload sources */}
              {currentStep === 1 && (
                <div className="space-y-4 animate-in slide-in-from-right-3 duration-100">
                  
                  {/* General custom display label */}
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-800 dark:text-white">
                      Document Display Title *
                    </h4>
                    <input
                      type="text"
                      placeholder="e.g. attention is all you need reference spec.pdf"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-202 dark:border-slate-800 bg-slate-50/55 dark:bg-slate-950 text-xs font-semibold outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                      required
                    />
                  </div>

                  {/* SUBSECTION 1: Dynamic Google Drive Direct Upload */}
                  {pdfType === 'upload' && (
                    <div className="border border-slate-105 dark:border-slate-800 p-4 rounded-2xl bg-slate-50/40 dark:bg-slate-950/20 space-y-3">
                      {!token ? (
                        <div className="text-center py-6 space-y-3">
                          <Cloud className="w-10 h-10 text-slate-404 mx-auto animate-pulse" />
                          <div className="space-y-1">
                            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">Google Authorization Required</h5>
                            <p className="text-[10px] text-slate-404 max-w-xs mx-auto">Authorize connection to your Google account to automatically manage organized folders inside Google Drive.</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleConnectGoogle}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-lg transition-colors inline-block cursor-pointer"
                          >
                            Connect Google Drive
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          <h5 className="text-xs font-bold text-slate-750 dark:text-slate-300 flex items-center gap-1.5">
                            <Upload className="w-4 h-4 text-blue-500" />
                            <span>Select Document for Organized Sync</span>
                          </h5>
                          
                          <input
                            type="file"
                            ref={fileInputRef}
                            accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                            onChange={handleFileChange}
                            className="hidden"
                          />

                          <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-8 rounded-2xl border-2 border-dashed border-slate-205 dark:border-slate-805 hover:border-blue-500 bg-white dark:bg-slate-950 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
                          >
                            <FileText className="w-8 h-8 text-blue-400" />
                            {selectedFile ? (
                              <div className="text-center px-4 space-y-1">
                                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-xs">{selectedFile.name}</p>
                                <p className="text-[10px] font-mono text-slate-404 font-medium">{formFileSize}</p>
                              </div>
                            ) : (
                              <div className="text-center">
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-550 transition-colors">Choose document from your computer</p>
                                <p className="text-[10px] text-slate-404 font-medium">Supports PDF, Documents, Whitepapers up to 50MB</p>
                              </div>
                            )}
                          </div>

                          <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/10 text-[10px] text-blue-600 dark:text-blue-405 font-medium flex items-start gap-1.5">
                            <span className="text-xs">📂</span>
                            <div>
                              <strong>Auto-folder alignment:</strong> This document will be synced into its corresponding Topic & Subtopic directories in Google Drive, keeping your cloud files immaculate!
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUBSECTION 2: Link Existing Google Drive File */}
                  {pdfType === 'link' && (
                    <div className="border border-slate-105 dark:border-slate-800 p-4 rounded-2xl bg-slate-50/40 dark:bg-slate-950/20 space-y-4">
                      {!token ? (
                        <div className="text-center py-6 space-y-3">
                          <Folder className="w-10 h-10 text-slate-404 mx-auto animate-pulse" />
                          <div className="space-y-1">
                            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">Google Authorization Required</h5>
                            <p className="text-[10px] text-slate-404 max-w-xs mx-auto">Connecting authorize you to query or select files already in your cloud storage.</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleConnectGoogle}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-lg transition-colors inline-block cursor-pointer"
                          >
                            Connect Google Drive
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-slate-750 dark:text-slate-350 flex items-center gap-1.5">
                              <Search className="w-4 h-4 text-blue-500" />
                              <span>Fetch/Select Document from Google Drive</span>
                            </h5>
                            {driveSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                          </div>

                          {/* Quick Explorer Query Filter */}
                          <input
                            type="text"
                            placeholder="Type keyword to filter your Google Drive catalogs..."
                            value={driveSearchQuery}
                            onChange={(e) => setDriveSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs rounded-xl outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                          />

                          {/* Drive Files Result List Box */}
                          <div className="border border-slate-202 dark:border-slate-805 bg-white dark:bg-slate-950 rounded-xl overflow-hidden max-h-[170px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-805 shadow-inner">
                            {driveFiles.map(file => {
                              const isSelected = selectedDriveFile?.id === file.id;
                              return (
                                <div
                                  key={file.id}
                                  onClick={() => {
                                    setSelectedDriveFile(file);
                                    setFormTitle(file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "));
                                    setFormError('');
                                  }}
                                  className={`p-2.5 text-left text-xs cursor-pointer transition-colors flex items-center justify-between ${isSelected ? 'bg-blue-500/10 border-l-4 border-blue-500' : 'hover:bg-slate-50 dark:hover:bg-slate-850'}`}
                                >
                                  <div className="truncate pr-3 space-y-0.5">
                                    <p className="font-extrabold text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                                    <p className="text-[10px] font-mono text-slate-404">Uploaded: {new Date(file.createdTime).toLocaleDateString()}</p>
                                  </div>
                                  <span className="text-[10px] font-mono shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                                    {file.size ? (parseInt(file.size) > 1024 * 1024 ? `${(parseInt(file.size)/(1024*1024)).toFixed(1)}M` : `${(parseInt(file.size)/1024).toFixed(0)}K`) : 'Resource'}
                                  </span>
                                </div>
                              );
                            })}

                            {driveFiles.length === 0 && !driveSearching && (
                              <div className="p-6 text-center text-[11px] text-slate-404 font-medium">
                                No matching documents found in your Google Drive. Try listing all files or verify your cloud storage directories.
                              </div>
                            )}
                          </div>

                          {selectedDriveFile && (
                            <div className="p-2.5 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-450 font-bold flex items-center gap-2">
                              <Check className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                              <span className="truncate">Selected: {selectedDriveFile.name} (File ID Connected)</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUBSECTION 3: Online public reference link */}
                  {pdfType === 'url' && (
                    <div className="border border-slate-105 dark:border-slate-800 p-4 rounded-2xl bg-slate-50/40 dark:bg-slate-950/20 space-y-4">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200 flex items-center gap-1.5 font-mono">
                          <Link className="w-4 h-4 text-emerald-500" />
                          <span>Pasted Online Document PDF Link (Online Web / ArXiv)</span>
                        </h4>
                        <input
                          type="url"
                          placeholder="e.g. https://arxiv.org/pdf/1706.03762.pdf"
                          value={formUrl}
                          onChange={(e) => {
                            setFormUrl(e.target.value);
                            if (e.target.value && !formTitle) {
                              try {
                                const pathname = new URL(e.target.value).pathname;
                                const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
                                if (filename) {
                                  setFormFileName(filename);
                                }
                              } catch {}
                            }
                          }}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-202 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* Linked note connection */}
                  <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-amber-500/5 border border-amber-500/10 animate-in fade-in shrink-0">
                    <input
                      type="checkbox"
                      id="pdfEnableLinkedNote"
                      checked={formEnableLinkedNote}
                      onChange={(e) => setFormEnableLinkedNote(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 accent-amber-500 cursor-pointer shrink-0"
                    />
                    <label htmlFor="pdfEnableLinkedNote" className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                      Enable Connected Quick Study Note 📝
                      <span className="block text-[10px] font-normal text-slate-404 mt-0.5">Creates an auto-linked floating work scratchpad specifically for active reading note-taking.</span>
                    </label>
                  </div>

                </div>
              )}

              {/* STEP 2: Pick connected syllabus Subtopic tag */}
              {currentStep === 2 && (
                <div className="space-y-4 animate-in slide-in-from-right-3 duration-100">
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-800 dark:text-white">
                      Associate connected syllabus Subtopic index *
                    </h4>
                    <p className="text-[10px] text-slate-404 font-medium">This directory structure determines the target Google Drive storage subfolders!</p>
                    
                    <select
                      required
                      value={formSubtopicId}
                      onChange={(e) => setFormSubtopicId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-202 dark:border-slate-850 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Choose subtopic index in syllabus --</option>
                      {subtopics.map(sub => {
                        const parent = topics.find(t => t.id === sub.topicId);
                        return (
                          <option key={sub.id} value={sub.id}>
                            {parent ? `${parent.name} ➔ ` : ''}{sub.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {pdfType === 'upload' && formSubtopicId && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-150 dark:border-slate-850 text-xs space-y-1.5 text-slate-650 dark:text-slate-350">
                      <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-mono">
                        <Folder className="w-3.5 h-3.5 text-blue-500" />
                        <span>Planned Drive Target Path:</span>
                      </p>
                      {(() => {
                        const { sub, topic } = getSubtopicPath(formSubtopicId);
                        const tName = topic ? topic.name : "Core Syllabus Concepts";
                        const sName = sub ? sub.name : "Associated Specs";
                        return (
                          <div className="font-mono text-[10px] bg-slate-100 dark:bg-slate-950 p-2 rounded-lg border dark:border-slate-850 truncate">
                            My Drive / {currentUser.name || 'StudentUser'} Curriculum Vault / {tName} / {sName} / {formFileName || selectedFile?.name}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Wizard Nav buttons on modal foot */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-105 dark:border-slate-800 shrink-0">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  disabled={uploadingToDrive}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-705 font-black rounded-xl text-xs transition-colors flex items-center gap-1 cursor-pointer dark:bg-slate-800 dark:text-slate-300 disabled:opacity-50"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              ) : (
                <div />
              )}

              {currentStep < 2 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-550 text-white font-black rounded-xl text-xs transition-all flex items-center gap-1 cursor-pointer ml-auto"
                >
                  <span>Next Step</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAddPdfItemSubmit}
                  disabled={uploadingToDrive}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-505 text-white font-black rounded-xl text-xs transition-all flex items-center gap-1 cursor-pointer ml-auto disabled:opacity-75"
                >
                  {uploadingToDrive ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Syncing with Drive...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Connect Reference Item</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Google Drive File Picker Dialog */}
      {isDrivePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => setIsDrivePickerOpen(false)} className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs" />
          
          <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150-all">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-850 shrink-0">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-500 shrink-0 animate-pulse" />
                <h3 className="font-extrabold font-sans text-lg text-slate-800 dark:text-white">
                  Google Drive File Explorer Picker
                </h3>
              </div>
              <button 
                onClick={() => setIsDrivePickerOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-404 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1 scrollbar-thin">
              {pickerError && (
                <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-405 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{pickerError}</span>
                </div>
              )}

              {/* Step context configuration */}
              <div className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1.5 font-mono">
                    Target Curriculum Topic / Subtopic *
                  </label>
                  <select
                    value={pickerSubtopicId}
                    onChange={(e) => {
                      setPickerSubtopicId(e.target.value);
                      setPickerError('');
                    }}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-955 border border-slate-205 dark:border-slate-800 text-xs rounded-xl outline-none text-slate-900 dark:text-white font-sans"
                  >
                    <option value="">-- Choose target subtopic sector --</option>
                    {topics.map(topic => {
                      const topicSubs = subtopics.filter(s => s.topicId === topic.id);
                      return (
                        <optgroup key={topic.id} label={topic.name}>
                          {topicSubs.map(s => (
                            <option key={s.id} value={s.id}>
                              {topic.name} ➔ {s.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-404 dark:text-slate-555 uppercase tracking-wider mb-1.5 font-mono">
                    Search and Filter Google Drive
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-404" />
                    <input
                      type="text"
                      placeholder="Type file keywords (e.g., pdf, cheat-sheet, syllabus)..."
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-955 border border-slate-202 dark:border-slate-800 text-xs rounded-xl outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">
                      Available Documents in Drive
                    </span>
                    {isPickerSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                  </div>

                  <div className="border border-slate-202 dark:border-slate-805 bg-white dark:bg-slate-955 rounded-2xl overflow-hidden max-h-[180px] overflow-y-auto divide-y divide-slate-105 dark:divide-slate-805 shadow-inner animate-in fade-in">
                    {drivePickerFiles.map(file => {
                      const isSelected = pickerSelectedFile?.id === file.id;
                      return (
                        <div
                          key={file.id}
                          onClick={() => {
                            setPickerSelectedFile(file);
                            setPickerError('');
                          }}
                          className={`p-3 text-left text-xs cursor-pointer transition-colors flex items-center justify-between ${isSelected ? 'bg-blue-500/10 border-l-4 border-blue-500' : 'hover:bg-slate-50 dark:hover:bg-slate-850'}`}
                        >
                          <div className="truncate pr-3 space-y-0.5">
                            <p className="font-extrabold text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                            <p className="text-[10px] font-mono text-slate-404">Created: {new Date(file.createdTime).toLocaleDateString()}</p>
                          </div>
                          <span className="text-[10px] font-mono shrink-0 bg-slate-105 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                            {file.size ? (parseInt(file.size) > 1024 * 1024 ? `${(parseInt(file.size)/(1024*1024)).toFixed(1)} MB` : `${(parseInt(file.size)/1024).toFixed(0)} KB`) : 'PDF Item'}
                          </span>
                        </div>
                      );
                    })}

                    {drivePickerFiles.length === 0 && !isPickerSearching && (
                      <div className="p-8 text-center text-xs text-slate-404 font-sans italic">
                        No files found in GDrive. Type in key characters or connect Google Drive.
                      </div>
                    )}
                  </div>
                </div>

                {pickerSelectedFile && (
                  <div className="p-3 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 text-xs text-emerald-650 dark:text-emerald-400 font-bold flex items-center gap-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-505 shrink-0" />
                    <span className="truncate">Ready to link: {pickerSelectedFile.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-850 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsDrivePickerOpen(false)}
                className="px-5 py-2.5 rounded-xl text-slate-505 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePickerImportSubmit}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-md transition-all cursor-pointer"
              >
                Import Reference Item
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
