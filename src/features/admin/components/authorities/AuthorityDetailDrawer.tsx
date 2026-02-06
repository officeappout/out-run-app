'use client';

import { useState, useEffect, type FocusEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users,
  MessageSquare,
  CheckSquare,
  Plus,
  Edit2,
  Trash2,
  Phone,
  Mail,
  Star,
  AlertCircle,
  Calendar,
  User,
  Clock,
  ChevronDown,
  Building2,
  Save,
  Loader2,
  Wallet,
  Check,
} from 'lucide-react';
import {
  Authority,
  AuthorityContact,
  ActivityLogEntry,
  AuthorityTask,
  AuthorityFinancials,
  Installment,
  PipelineStatus,
  TaskStatus,
  ContactRole,
  InstallmentStatus,
  CONTACT_ROLE_LABELS,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_COLORS,
  TASK_STATUS_LABELS,
  getPrimaryContact,
  hasOverdueTasks,
  hasOverdueInstallments,
  getInstallmentsSum,
  formatMonthHebrew,
  generateMonthOptions,
} from '@/types/admin-types';
import {
  updatePipelineStatus,
  addContact,
  updateContact,
  deleteContact,
  addActivityLogEntry,
  addTask,
  updateTask,
  deleteTask,
  getAuthority,
  updateFinancials,
  addInstallment,
  updateInstallment,
  deleteInstallment,
} from '@/features/admin/services/authority.service';
import { getAllSuperAdmins, AdminUser } from '@/features/admin/services/admin-management.service';

type TabId = 'contacts' | 'activity' | 'tasks' | 'finance';

interface AuthorityDetailDrawerProps {
  authority: Authority | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void; // Callback to refresh data
  adminInfo?: { adminId: string; adminName: string };
}

export default function AuthorityDetailDrawer({
  authority: initialAuthority,
  isOpen,
  onClose,
  onUpdate,
  adminInfo,
}: AuthorityDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('contacts');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Local authority state for immediate updates
  const [authority, setAuthority] = useState<Authority | null>(initialAuthority);
  
  // System admins for task assignment dropdown
  const [systemAdmins, setSystemAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  
  // Contact form state
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<AuthorityContact | null>(null);
  const [contactForm, setContactForm] = useState<Partial<AuthorityContact>>({});
  
  // Activity log state
  const [newActivityContent, setNewActivityContent] = useState('');
  
  // Task form state
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<AuthorityTask | null>(null);
  const [taskForm, setTaskForm] = useState<Partial<AuthorityTask>>({});
  
  // Pipeline status dropdown
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  
  // Finance/Installment state
  const [totalQuoteAmount, setTotalQuoteAmount] = useState<number>(0);
  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [editingInstallment, setEditingInstallment] = useState<Installment | null>(null);
  const [installmentForm, setInstallmentForm] = useState<Partial<Installment>>({});
  const monthOptions = generateMonthOptions(24);

  // Sync local authority with prop
  useEffect(() => {
    setAuthority(initialAuthority);
  }, [initialAuthority]);

  // Fetch system admins for dropdown
  useEffect(() => {
    if (isOpen) {
      setLoadingAdmins(true);
      getAllSuperAdmins()
        .then(setSystemAdmins)
        .catch(console.error)
        .finally(() => setLoadingAdmins(false));
    }
  }, [isOpen]);

  // Reset forms when authority changes
  useEffect(() => {
    setShowContactForm(false);
    setEditingContact(null);
    setContactForm({});
    setNewActivityContent('');
    setShowTaskForm(false);
    setEditingTask(null);
    setTaskForm({});
    setShowStatusDropdown(false);
    setShowInstallmentForm(false);
    setEditingInstallment(null);
    setInstallmentForm({});
    setTotalQuoteAmount(authority?.financials?.totalQuoteAmount || 0);
  }, [authority?.id]);

  // Sync totalQuoteAmount when authority changes
  useEffect(() => {
    if (authority?.financials?.totalQuoteAmount !== undefined) {
      setTotalQuoteAmount(authority.financials.totalQuoteAmount);
    }
  }, [authority?.financials?.totalQuoteAmount]);

  // Refresh authority data from server
  const refreshAuthority = async () => {
    if (!authority?.id) return;
    try {
      const updated = await getAuthority(authority.id);
      if (updated) {
        setAuthority(updated);
      }
    } catch (error) {
      console.error('Error refreshing authority:', error);
    }
  };

  if (!authority) return null;

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number; alert?: boolean }[] = [
    { id: 'contacts', label: 'אנשי קשר', icon: <Users size={18} />, badge: authority.contacts?.length },
    { id: 'activity', label: 'פעילות', icon: <MessageSquare size={18} />, badge: authority.activityLog?.length },
    { 
      id: 'tasks', 
      label: 'משימות', 
      icon: <CheckSquare size={18} />, 
      badge: authority.tasks?.filter(t => t.status !== 'done' && t.status !== 'cancelled').length,
    },
    {
      id: 'finance',
      label: 'כספים',
      icon: <Wallet size={18} />,
      badge: authority.financials?.installments?.filter(i => i.status === 'pending').length,
      alert: hasOverdueInstallments(authority),
    },
  ];

  const handlePipelineStatusChange = async (status: PipelineStatus) => {
    if (!authority) return;
    setIsSaving(true);
    try {
      await updatePipelineStatus(authority.id, status, adminInfo);
      setShowStatusDropdown(false);
      await refreshAuthority();
      onUpdate();
    } catch (error) {
      console.error('Error updating pipeline status:', error);
      alert('שגיאה בעדכון סטטוס');
    } finally {
      setIsSaving(false);
    }
  };

  // Contact handlers
  const handleSaveContact = async () => {
    if (!authority || !contactForm.name) return;
    setIsSaving(true);
    try {
      if (editingContact) {
        await updateContact(authority.id, editingContact.id, contactForm, adminInfo);
      } else {
        await addContact(authority.id, {
          name: contactForm.name,
          role: contactForm.role || 'other',
          phone: contactForm.phone,
          email: contactForm.email,
          isPrimary: contactForm.isPrimary || false,
          notes: contactForm.notes,
        }, adminInfo);
      }
      setShowContactForm(false);
      setEditingContact(null);
      setContactForm({});
      await refreshAuthority();
      onUpdate();
    } catch (error) {
      console.error('Error saving contact:', error);
      alert('שגיאה בשמירת איש קשר');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!authority || !confirm('האם למחוק איש קשר זה?')) return;
    setIsSaving(true);
    try {
      await deleteContact(authority.id, contactId, adminInfo);
      await refreshAuthority();
      onUpdate();
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert('שגיאה במחיקת איש קשר');
    } finally {
      setIsSaving(false);
    }
  };

  // Activity log handlers
  const handleAddActivity = async () => {
    if (!authority || !newActivityContent.trim() || !adminInfo) return;
    setIsSaving(true);
    try {
      await addActivityLogEntry(authority.id, newActivityContent.trim(), adminInfo);
      setNewActivityContent('');
      await refreshAuthority();
      onUpdate();
    } catch (error) {
      console.error('Error adding activity:', error);
      alert('שגיאה בהוספת פעילות');
    } finally {
      setIsSaving(false);
    }
  };

  // Task handlers
  const handleSaveTask = async () => {
    if (!authority || !taskForm.title) return;
    setIsSaving(true);
    try {
      if (editingTask) {
        await updateTask(authority.id, editingTask.id, taskForm, adminInfo);
      } else {
        await addTask(authority.id, {
          title: taskForm.title,
          description: taskForm.description,
          status: taskForm.status || 'pending',
          dueDate: taskForm.dueDate,
          assignedTo: taskForm.assignedTo,
          assignedToName: taskForm.assignedToName,
        }, adminInfo);
      }
      setShowTaskForm(false);
      setEditingTask(null);
      setTaskForm({});
      await refreshAuthority();
      onUpdate();
    } catch (error) {
      console.error('Error saving task:', error);
      alert('שגיאה בשמירת משימה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTaskStatus = async (task: AuthorityTask) => {
    if (!authority) return;
    const newStatus: TaskStatus = task.status === 'done' ? 'pending' : 'done';
    setIsSaving(true);
    try {
      await updateTask(authority.id, task.id, { status: newStatus }, adminInfo);
      await refreshAuthority();
      onUpdate();
    } catch (error) {
      console.error('Error updating task:', error);
      alert('שגיאה בעדכון משימה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!authority || !confirm('האם למחוק משימה זו?')) return;
    setIsSaving(true);
    try {
      await deleteTask(authority.id, taskId, adminInfo);
      await refreshAuthority();
      onUpdate();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('שגיאה במחיקת משימה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssigneeChange = (adminId: string) => {
    const admin = systemAdmins.find(a => a.id === adminId);
    setTaskForm({
      ...taskForm,
      assignedTo: adminId || undefined,
      assignedToName: admin?.name || undefined,
    });
  };

  // Finance handlers
  const handleSaveTotalQuote = async () => {
    console.log('[Drawer] handleSaveTotalQuote called, totalQuoteAmount:', totalQuoteAmount);
    console.log('[Drawer] authority:', authority?.id, 'adminInfo:', adminInfo);
    
    if (!authority) {
      console.log('[Drawer] No authority, returning');
      return;
    }
    if (!adminInfo) {
      alert('שגיאה: לא מחובר. נא לרענן את הדף.');
      return;
    }
    
    setIsSaving(true);
    try {
      const currentFinancials = authority.financials || { totalQuoteAmount: 0, installments: [] };
      const updatedFinancials = { ...currentFinancials, totalQuoteAmount };
      console.log('[Drawer] Saving financials:', updatedFinancials);
      await updateFinancials(authority.id, updatedFinancials, adminInfo);
      console.log('[Drawer] Financials saved successfully');
      await refreshAuthority();
      onUpdate();
    } catch (error: any) {
      console.error('[Drawer] Error saving total quote:', error);
      alert(`שגיאה בשמירת סכום הצעת מחיר: ${error?.message || error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInstallment = async () => {
    console.log('[Drawer] handleSaveInstallment called:', installmentForm);
    console.log('[Drawer] authority:', authority?.id, 'adminInfo:', adminInfo);
    
    if (!authority || !installmentForm.amount || !installmentForm.targetMonth) {
      console.log('[Drawer] Missing required fields, returning');
      return;
    }
    if (!adminInfo) {
      alert('שגיאה: לא מחובר. נא לרענן את הדף.');
      return;
    }
    
    setIsSaving(true);
    try {
      if (editingInstallment) {
        console.log('[Drawer] Updating installment:', editingInstallment.id);
        await updateInstallment(authority.id, editingInstallment.id, installmentForm, adminInfo);
      } else {
        const newInstallmentData = {
          amount: installmentForm.amount,
          targetMonth: installmentForm.targetMonth,
          status: installmentForm.status || 'pending',
        };
        console.log('[Drawer] Adding new installment:', newInstallmentData);
        await addInstallment(authority.id, newInstallmentData, adminInfo);
      }
      console.log('[Drawer] Installment saved successfully');
      setShowInstallmentForm(false);
      setEditingInstallment(null);
      setInstallmentForm({});
      await refreshAuthority();
      onUpdate();
    } catch (error: any) {
      console.error('[Drawer] Error saving installment:', error);
      alert(`שגיאה בשמירת פעימה: ${error?.message || error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteInstallment = async (installmentId: string) => {
    if (!authority || !confirm('האם למחוק פעימה זו?')) return;
    setIsSaving(true);
    try {
      await deleteInstallment(authority.id, installmentId, adminInfo);
      await refreshAuthority();
      onUpdate();
    } catch (error) {
      console.error('Error deleting installment:', error);
      alert('שגיאה במחיקת פעימה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleInstallmentStatus = async (installment: Installment) => {
    if (!authority) return;
    const newStatus: InstallmentStatus = installment.status === 'paid' ? 'pending' : 'paid';
    setIsSaving(true);
    try {
      await updateInstallment(authority.id, installment.id, { status: newStatus }, adminInfo);
      await refreshAuthority();
      onUpdate();
    } catch (error) {
      console.error('Error updating installment status:', error);
      alert('שגיאה בעדכון סטטוס');
    } finally {
      setIsSaving(false);
    }
  };

  const isInstallmentOverdue = (installment: Installment) => {
    if (installment.status === 'paid') return false;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return installment.targetMonth < currentMonth;
  };

  const isTaskOverdue = (task: AuthorityTask) => {
    if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') return false;
    return new Date(task.dueDate) < new Date();
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateTime = (date: Date | undefined) => {
    if (!date) return '';
    return new Date(date).toLocaleString('he-IL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const currentStatus = authority.pipelineStatus || 'lead';
  const statusColors = PIPELINE_STATUS_COLORS[currentStatus];

  const handleContactFormBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    if (!contactForm.name || isSaving) return;
    handleSaveContact();
  };

  const handleTaskFormBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    if (!taskForm.title || isSaving) return;
    handleSaveTask();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 left-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
            dir="rtl"
          >
            {/* Saving Indicator */}
            {isSaving && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-500 animate-pulse z-10" />
            )}

            {/* Header */}
            <div className="flex-shrink-0 border-b border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {authority.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={authority.logoUrl}
                        alt={authority.name}
                        className="w-14 h-14 rounded-xl object-cover"
                      />
                    ) : (
                      <Building2 size={24} className="text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-gray-900 truncate">{authority.name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      {/* Pipeline Status Dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                          disabled={isSaving}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}
                        >
                          {PIPELINE_STATUS_LABELS[currentStatus]}
                          <ChevronDown size={14} className={`transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {showStatusDropdown && (
                          <div className="absolute top-full right-0 mt-1 w-40 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-10">
                            {(Object.keys(PIPELINE_STATUS_LABELS) as PipelineStatus[]).map((status) => {
                              const colors = PIPELINE_STATUS_COLORS[status];
                              return (
                                <button
                                  key={status}
                                  onClick={() => handlePipelineStatusChange(status)}
                                  className={`w-full text-right px-3 py-2 text-sm font-medium hover:bg-gray-50 transition-colors ${
                                    status === currentStatus ? colors.bg + ' ' + colors.text : 'text-gray-700'
                                  }`}
                                >
                                  {PIPELINE_STATUS_LABELS[status]}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      
                      {/* Overdue Alert Badge */}
                      {hasOverdueTasks(authority) && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-bold">
                          <AlertCircle size={12} />
                          משימות באיחור
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 border-b border-gray-200">
              <div className="flex">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold transition-colors relative ${
                      activeTab === tab.id
                        ? 'text-cyan-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-xs flex items-center justify-center ${
                        activeTab === tab.id ? 'bg-cyan-100 text-cyan-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-600"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Contacts Tab */}
              {activeTab === 'contacts' && (
                <div className="space-y-4">
                  {/* Add Contact Button */}
                  <button
                    onClick={() => {
                      setEditingContact(null);
                      setContactForm({});
                      setShowContactForm(true);
                    }}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-bold hover:border-cyan-400 hover:text-cyan-600 transition-colors disabled:opacity-50"
                  >
                    <Plus size={18} />
                    הוסף איש קשר
                  </button>

                  {/* Contact Form */}
                  {showContactForm && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onBlur={handleContactFormBlur}
                      tabIndex={-1}
                      className="bg-gray-50 rounded-xl p-4 space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-sm font-bold text-gray-700 mb-1">שם</label>
                          <input
                            type="text"
                            value={contactForm.name || ''}
                            onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            placeholder="שם איש הקשר"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">תפקיד</label>
                          <select
                            value={contactForm.role || 'other'}
                            onChange={(e) => setContactForm({ ...contactForm, role: e.target.value as ContactRole })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                          >
                            {(Object.keys(CONTACT_ROLE_LABELS) as ContactRole[]).map((role) => (
                              <option key={role} value={role}>
                                {CONTACT_ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">טלפון</label>
                          <input
                            type="tel"
                            value={contactForm.phone || ''}
                            onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            placeholder="050-0000000"
                            dir="ltr"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm font-bold text-gray-700 mb-1">אימייל</label>
                          <input
                            type="email"
                            value={contactForm.email || ''}
                            onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            placeholder="email@example.com"
                            dir="ltr"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={contactForm.isPrimary || false}
                              onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                              className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                            />
                            <span className="text-sm font-medium text-gray-700">איש קשר ראשי</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setShowContactForm(false);
                            setEditingContact(null);
                            setContactForm({});
                          }}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                        >
                          ביטול
                        </button>
                        <button
                          onClick={handleSaveContact}
                          disabled={!contactForm.name || isSaving}
                          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-bold disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          שמור
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Contacts List */}
                  {authority.contacts && authority.contacts.length > 0 ? (
                    <div className="space-y-3">
                      {authority.contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className={`bg-white border rounded-xl p-4 ${
                            contact.isPrimary ? 'border-cyan-300 ring-1 ring-cyan-200' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900">{contact.name}</span>
                                {contact.isPrimary && (
                                  <Star size={14} className="text-amber-500 fill-amber-500" />
                                )}
                              </div>
                              <span className="text-sm text-gray-500">{CONTACT_ROLE_LABELS[contact.role]}</span>
                              <div className="flex flex-wrap gap-3 mt-2">
                                {contact.phone && (
                                  <a
                                    href={`tel:${contact.phone}`}
                                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-cyan-600"
                                  >
                                    <Phone size={14} />
                                    <span dir="ltr">{contact.phone}</span>
                                  </a>
                                )}
                                {contact.email && (
                                  <a
                                    href={`mailto:${contact.email}`}
                                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-cyan-600"
                                  >
                                    <Mail size={14} />
                                    {contact.email}
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingContact(contact);
                                  setContactForm(contact);
                                  setShowContactForm(true);
                                }}
                                disabled={isSaving}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteContact(contact.id)}
                                disabled={isSaving}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !showContactForm && (
                    <div className="text-center py-8 text-gray-500">
                      <Users size={32} className="mx-auto mb-2 opacity-50" />
                      <p>אין אנשי קשר עדיין</p>
                    </div>
                  )}
                </div>
              )}

              {/* Activity Log Tab */}
              {activeTab === 'activity' && (
                <div className="space-y-4">
                  {/* Add Activity Input */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <textarea
                      value={newActivityContent}
                      onChange={(e) => setNewActivityContent(e.target.value)}
                      onBlur={() => {
                        if (newActivityContent.trim() && !isSaving && adminInfo) {
                          handleAddActivity();
                        }
                      }}
                      placeholder="רשום פעילות חדשה (פגישה, שיחת טלפון, הערה...)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleAddActivity}
                        disabled={!newActivityContent.trim() || isSaving || !adminInfo}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-bold disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        הוסף רשומה
                      </button>
                    </div>
                  </div>

                  {/* Activity List */}
                  {authority.activityLog && authority.activityLog.length > 0 ? (
                    <div className="space-y-3">
                      {authority.activityLog.map((entry) => (
                        <div key={entry.id} className="bg-white border border-gray-200 rounded-xl p-4">
                          <p className="text-gray-800 whitespace-pre-wrap">{entry.content}</p>
                          <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                            {entry.createdByName && (
                              <span className="flex items-center gap-1">
                                <User size={12} />
                                {entry.createdByName}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {formatDateTime(entry.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                      <p>אין פעילות מתועדת עדיין</p>
                    </div>
                  )}
                </div>
              )}

              {/* Finance Tab */}
              {activeTab === 'finance' && (
                <div className="space-y-6">
                  {/* Total Quote Amount */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
                    <label className="block text-sm font-bold text-emerald-800 mb-2">
                      סכום הצעת מחיר כולל
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold">₪</span>
                        <input
                          type="number"
                          value={totalQuoteAmount || ''}
                          onChange={(e) => setTotalQuoteAmount(parseFloat(e.target.value) || 0)}
                          onBlur={handleSaveTotalQuote}
                          className="w-full pr-8 pl-4 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-lg font-bold text-emerald-900"
                          placeholder="0"
                          min="0"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Installments Validation Warning */}
                  {(() => {
                    const installments = authority.financials?.installments || [];
                    const sum = getInstallmentsSum(installments);
                    const total = authority.financials?.totalQuoteAmount || 0;
                    if (installments.length > 0 && sum !== total) {
                      const diff = total - sum;
                      return (
                        <div className={`flex items-center gap-2 p-3 rounded-lg ${diff > 0 ? 'bg-amber-50 border border-amber-300' : 'bg-red-50 border border-red-300'}`}>
                          <AlertCircle size={18} className={diff > 0 ? 'text-amber-600' : 'text-red-600'} />
                          <span className={`text-sm font-medium ${diff > 0 ? 'text-amber-800' : 'text-red-800'}`}>
                            {diff > 0 
                              ? `חסרים ₪${diff.toLocaleString()} לפעימות` 
                              : `עודף של ₪${Math.abs(diff).toLocaleString()} בפעימות`}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Add Installment Button */}
                  <button
                    onClick={() => {
                      setEditingInstallment(null);
                      setInstallmentForm({ status: 'pending' });
                      setShowInstallmentForm(true);
                    }}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-bold hover:border-cyan-400 hover:text-cyan-600 transition-colors disabled:opacity-50"
                  >
                    <Plus size={18} />
                    הוסף פעימת תשלום
                  </button>

                  {/* Installment Form */}
                  {showInstallmentForm && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gray-50 rounded-xl p-4 space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">סכום (₪)</label>
                          <input
                            type="number"
                            value={installmentForm.amount || ''}
                            onChange={(e) => setInstallmentForm({ ...installmentForm, amount: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            placeholder="0"
                            min="0"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">חודש יעד</label>
                          <select
                            value={installmentForm.targetMonth || ''}
                            onChange={(e) => setInstallmentForm({ ...installmentForm, targetMonth: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                          >
                            <option value="">בחר חודש</option>
                            {monthOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setShowInstallmentForm(false);
                            setEditingInstallment(null);
                            setInstallmentForm({});
                          }}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                        >
                          ביטול
                        </button>
                        <button
                          onClick={handleSaveInstallment}
                          disabled={!installmentForm.amount || !installmentForm.targetMonth || isSaving}
                          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-bold disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          שמור
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Installments List */}
                  {authority.financials?.installments && authority.financials.installments.length > 0 ? (
                    <div className="space-y-3">
                      {[...authority.financials.installments]
                        .sort((a, b) => a.targetMonth.localeCompare(b.targetMonth))
                        .map((installment) => {
                          const overdue = isInstallmentOverdue(installment);
                          const isPaid = installment.status === 'paid';
                          
                          return (
                            <div
                              key={installment.id}
                              className={`bg-white border rounded-xl p-4 ${
                                overdue ? 'border-red-300 bg-red-50/50' : 
                                isPaid ? 'border-green-300 bg-green-50/30' :
                                'border-gray-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => handleToggleInstallmentStatus(installment)}
                                  disabled={isSaving}
                                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    isPaid 
                                      ? 'border-green-500 bg-green-500 text-white' 
                                      : overdue 
                                      ? 'border-red-400 hover:border-red-500'
                                      : 'border-gray-300 hover:border-cyan-500'
                                  }`}
                                >
                                  {isPaid && <Check size={14} />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-lg font-bold ${isPaid ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                      ₪{installment.amount.toLocaleString()}
                                    </span>
                                    {overdue && (
                                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                                        <AlertCircle size={10} />
                                        באיחור
                                      </span>
                                    )}
                                    {isPaid && (
                                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                                        <Check size={10} />
                                        שולם
                                      </span>
                                    )}
                                  </div>
                                  <span className={`text-sm ${overdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                    {formatMonthHebrew(installment.targetMonth)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingInstallment(installment);
                                      setInstallmentForm(installment);
                                      setShowInstallmentForm(true);
                                    }}
                                    disabled={isSaving}
                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteInstallment(installment.id)}
                                    disabled={isSaving}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : !showInstallmentForm && (
                    <div className="text-center py-8 text-gray-500">
                      <Wallet size={32} className="mx-auto mb-2 opacity-50" />
                      <p>אין פעימות תשלום עדיין</p>
                    </div>
                  )}

                  {/* Summary */}
                  {authority.financials?.installments && authority.financials.installments.length > 0 && (
                    <div className="bg-gray-100 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">סה"כ הצעת מחיר:</span>
                        <span className="font-bold text-gray-900">₪{(authority.financials?.totalQuoteAmount || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">שולם:</span>
                        <span className="font-bold text-green-600">
                          ₪{authority.financials.installments
                            .filter(i => i.status === 'paid')
                            .reduce((sum, i) => sum + i.amount, 0)
                            .toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-gray-300 pt-2">
                        <span className="text-gray-600">נותר לגבייה:</span>
                        <span className="font-bold text-amber-600">
                          ₪{authority.financials.installments
                            .filter(i => i.status === 'pending')
                            .reduce((sum, i) => sum + i.amount, 0)
                            .toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tasks Tab */}
              {activeTab === 'tasks' && (
                <div className="space-y-4">
                  {/* Add Task Button */}
                  <button
                    onClick={() => {
                      setEditingTask(null);
                      setTaskForm({});
                      setShowTaskForm(true);
                    }}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-bold hover:border-cyan-400 hover:text-cyan-600 transition-colors disabled:opacity-50"
                  >
                    <Plus size={18} />
                    הוסף משימה
                  </button>

                  {/* Task Form */}
                  {showTaskForm && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onBlur={handleTaskFormBlur}
                      tabIndex={-1}
                      className="bg-gray-50 rounded-xl p-4 space-y-4"
                    >
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">כותרת המשימה</label>
                        <input
                          type="text"
                          value={taskForm.title || ''}
                          onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                          placeholder="מה צריך לעשות?"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">תיאור (אופציונלי)</label>
                        <textarea
                          value={taskForm.description || ''}
                          onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                          rows={2}
                          placeholder="פרטים נוספים..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">תאריך יעד</label>
                          <input
                            type="date"
                            value={taskForm.dueDate ? new Date(taskForm.dueDate).toISOString().split('T')[0] : ''}
                            onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value ? new Date(e.target.value) : undefined })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">אחראי</label>
                          {loadingAdmins ? (
                            <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-400 flex items-center gap-2">
                              <Loader2 size={14} className="animate-spin" />
                              טוען...
                            </div>
                          ) : (
                            <select
                              value={taskForm.assignedTo || ''}
                              onChange={(e) => handleAssigneeChange(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            >
                              <option value="">בחר אחראי</option>
                              {systemAdmins.map((admin) => (
                                <option key={admin.id} value={admin.id}>
                                  {admin.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setShowTaskForm(false);
                            setEditingTask(null);
                            setTaskForm({});
                          }}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                        >
                          ביטול
                        </button>
                        <button
                          onClick={handleSaveTask}
                          disabled={!taskForm.title || isSaving}
                          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-bold disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          שמור
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Tasks List */}
                  {authority.tasks && authority.tasks.length > 0 ? (
                    <div className="space-y-3">
                      {/* Sort tasks: incomplete first, then by due date */}
                      {[...authority.tasks]
                        .sort((a, b) => {
                          // Completed/cancelled at bottom
                          const aComplete = a.status === 'done' || a.status === 'cancelled';
                          const bComplete = b.status === 'done' || b.status === 'cancelled';
                          if (aComplete && !bComplete) return 1;
                          if (!aComplete && bComplete) return -1;
                          // Overdue at top
                          const aOverdue = isTaskOverdue(a);
                          const bOverdue = isTaskOverdue(b);
                          if (aOverdue && !bOverdue) return -1;
                          if (!aOverdue && bOverdue) return 1;
                          // Then by due date
                          if (a.dueDate && b.dueDate) {
                            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                          }
                          return 0;
                        })
                        .map((task) => {
                          const overdue = isTaskOverdue(task);
                          const isDone = task.status === 'done';
                          const isCancelled = task.status === 'cancelled';
                          
                          return (
                            <div
                              key={task.id}
                              className={`bg-white border rounded-xl p-4 ${
                                overdue ? 'border-red-300 bg-red-50/50' : 
                                isDone ? 'border-green-300 bg-green-50/30' :
                                isCancelled ? 'border-gray-300 bg-gray-50 opacity-60' :
                                'border-gray-200'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <button
                                  onClick={() => handleToggleTaskStatus(task)}
                                  disabled={isCancelled || isSaving}
                                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    isDone 
                                      ? 'border-green-500 bg-green-500 text-white' 
                                      : overdue 
                                      ? 'border-red-400 hover:border-red-500'
                                      : 'border-gray-300 hover:border-cyan-500'
                                  }`}
                                >
                                  {isDone && <CheckSquare size={14} />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`font-bold ${isDone || isCancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                      {task.title}
                                    </span>
                                    {overdue && (
                                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                                        <AlertCircle size={10} />
                                        באיחור
                                      </span>
                                    )}
                                  </div>
                                  {task.description && (
                                    <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                                  )}
                                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                                    {task.dueDate && (
                                      <span className={`flex items-center gap-1 ${overdue ? 'text-red-600 font-bold' : ''}`}>
                                        <Calendar size={12} />
                                        {formatDate(task.dueDate)}
                                      </span>
                                    )}
                                    {task.assignedToName && (
                                      <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                        <User size={12} />
                                        {task.assignedToName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingTask(task);
                                      setTaskForm(task);
                                      setShowTaskForm(true);
                                    }}
                                    disabled={isSaving}
                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTask(task.id)}
                                    disabled={isSaving}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : !showTaskForm && (
                    <div className="text-center py-8 text-gray-500">
                      <CheckSquare size={32} className="mx-auto mb-2 opacity-50" />
                      <p>אין משימות פתוחות</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
