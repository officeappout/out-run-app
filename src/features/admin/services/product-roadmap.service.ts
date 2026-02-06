/**
 * Firestore Service for Product Roadmap & Feedback Management
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  ProductTask,
  ProductTag,
  UserFeedback,
  TaskStatus,
  TaskPriority,
  TaskSource,
  DEFAULT_TAGS,
} from '@/types/product-roadmap.types';
import { logAction } from './audit.service';

const TASKS_COLLECTION = 'product_roadmap';
const TAGS_COLLECTION = 'product_tags';
const FEEDBACK_COLLECTION = 'user_feedback';

/**
 * Convert Date to Firestore-safe format
 */
function toFirestoreDate(date: Date | undefined | null): string | null {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString();
  return null;
}

/**
 * Convert Firestore timestamp or ISO string to Date
 */
function toDate(timestamp: Timestamp | Date | string | undefined | null): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (typeof timestamp === 'object' && 'toDate' in timestamp) return timestamp.toDate();
  return undefined;
}

/**
 * Normalize task data from Firestore
 */
function normalizeTask(docId: string, data: any): ProductTask {
  return {
    id: docId,
    title: data?.title || '',
    description: data?.description || '',
    source: data?.source || 'admin',
    priority: data?.priority || 'medium',
    status: data?.status || 'backlog',
    tags: Array.isArray(data?.tags) ? data.tags : [],
    feedbackId: data?.feedbackId || undefined,
    assignedTo: data?.assignedTo || undefined,
    assignedToName: data?.assignedToName || undefined,
    estimatedHours: data?.estimatedHours || undefined,
    dueDate: toDate(data?.dueDate),
    createdBy: data?.createdBy || undefined,
    createdByName: data?.createdByName || undefined,
    createdAt: toDate(data?.createdAt) || new Date(),
    updatedAt: toDate(data?.updatedAt) || new Date(),
    completedAt: toDate(data?.completedAt),
  };
}

/**
 * Normalize tag data from Firestore
 */
function normalizeTag(docId: string, data: any): ProductTag {
  return {
    id: docId,
    name: data?.name || '',
    color: data?.color || '#6B7280',
    createdAt: toDate(data?.createdAt) || new Date(),
  };
}

/**
 * Normalize feedback data from Firestore
 */
function normalizeFeedback(docId: string, data: any): UserFeedback {
  return {
    id: docId,
    content: data?.content || '',
    userId: data?.userId || undefined,
    userName: data?.userName || undefined,
    userEmail: data?.userEmail || undefined,
    category: data?.category || undefined,
    isConverted: data?.isConverted || false,
    convertedTaskId: data?.convertedTaskId || undefined,
    createdAt: toDate(data?.createdAt) || new Date(),
  };
}

// ============ TASKS ============

/**
 * Get all tasks
 */
export async function getAllTasks(): Promise<ProductTask[]> {
  try {
    const q = query(collection(db, TASKS_COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => normalizeTask(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching tasks:', error);
    throw error;
  }
}

/**
 * Get tasks by status
 */
export async function getTasksByStatus(status: TaskStatus): Promise<ProductTask[]> {
  try {
    const q = query(
      collection(db, TASKS_COLLECTION),
      where('status', '==', status),
      orderBy('priority', 'asc'),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => normalizeTask(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching tasks by status:', error);
    throw error;
  }
}

/**
 * Get tasks by tag
 */
export async function getTasksByTag(tag: string): Promise<ProductTask[]> {
  try {
    const q = query(
      collection(db, TASKS_COLLECTION),
      where('tags', 'array-contains', tag),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => normalizeTask(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching tasks by tag:', error);
    throw error;
  }
}

/**
 * Get a single task by ID
 */
export async function getTask(taskId: string): Promise<ProductTask | null> {
  try {
    const docRef = doc(db, TASKS_COLLECTION, taskId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return normalizeTask(docSnap.id, docSnap.data());
  } catch (error) {
    console.error('Error fetching task:', error);
    throw error;
  }
}

/**
 * Create a new task
 */
export async function createTask(
  data: Omit<ProductTask, 'id' | 'createdAt' | 'updatedAt'>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<string> {
  console.log('[ProductRoadmap] createTask called with:', { data, adminInfo });
  
  try {
    const taskData = {
      title: data.title,
      description: data.description || '',
      source: data.source || 'admin',
      priority: data.priority || 'medium',
      status: data.status || 'backlog',
      tags: data.tags || [],
      feedbackId: data.feedbackId || null,
      assignedTo: data.assignedTo || null,
      assignedToName: data.assignedToName || null,
      estimatedHours: data.estimatedHours || null,
      dueDate: toFirestoreDate(data.dueDate),
      createdBy: adminInfo?.adminId || null,
      createdByName: adminInfo?.adminName || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    console.log('[ProductRoadmap] Saving to Firestore:', taskData);
    const docRef = await addDoc(collection(db, TASKS_COLLECTION), taskData);
    console.log('[ProductRoadmap] Task saved with ID:', docRef.id);

    // Log audit action
    if (adminInfo) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'CREATE',
        targetEntity: 'ProductTask',
        targetId: docRef.id,
        details: `Created task: "${data.title}"`,
      });
    }

    return docRef.id;
  } catch (error) {
    console.error('[ProductRoadmap] Error creating task:', error);
    throw error;
  }
}

/**
 * Update a task
 */
export async function updateTask(
  taskId: string,
  data: Partial<Omit<ProductTask, 'id' | 'createdAt'>>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const docRef = doc(db, TASKS_COLLECTION, taskId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.status !== undefined) {
      updateData.status = data.status;
      // Set completedAt when task is marked as done
      if (data.status === 'done') {
        updateData.completedAt = serverTimestamp();
      }
    }
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo || null;
    if (data.assignedToName !== undefined) updateData.assignedToName = data.assignedToName || null;
    if (data.estimatedHours !== undefined) updateData.estimatedHours = data.estimatedHours || null;
    if (data.dueDate !== undefined) updateData.dueDate = toFirestoreDate(data.dueDate);

    await updateDoc(docRef, updateData);

    // Log audit action
    if (adminInfo) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'ProductTask',
        targetId: taskId,
        details: `Updated task`,
      });
    }
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

/**
 * Delete a task
 */
export async function deleteTask(
  taskId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const task = await getTask(taskId);
    await deleteDoc(doc(db, TASKS_COLLECTION, taskId));

    // Log audit action
    if (adminInfo && task) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'DELETE',
        targetEntity: 'ProductTask',
        targetId: taskId,
        details: `Deleted task: "${task.title}"`,
      });
    }
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
}

/**
 * Update task status (quick action for kanban drag-drop)
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  return updateTask(taskId, { status }, adminInfo);
}

// ============ TAGS ============

/**
 * Get all tags
 */
export async function getAllTags(): Promise<ProductTag[]> {
  try {
    const q = query(collection(db, TAGS_COLLECTION), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => normalizeTag(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching tags:', error);
    throw error;
  }
}

/**
 * Initialize default tags (run once)
 */
export async function initializeDefaultTags(): Promise<void> {
  try {
    const existingTags = await getAllTags();
    if (existingTags.length > 0) {
      console.log('[ProductRoadmap] Tags already exist, skipping initialization');
      return;
    }

    for (const tag of DEFAULT_TAGS) {
      await addDoc(collection(db, TAGS_COLLECTION), {
        name: tag.name,
        color: tag.color,
        createdAt: serverTimestamp(),
      });
    }
    console.log('[ProductRoadmap] Default tags initialized');
  } catch (error) {
    console.error('Error initializing default tags:', error);
    throw error;
  }
}

/**
 * Create a new tag
 */
export async function createTag(
  data: Omit<ProductTag, 'id' | 'createdAt'>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<string> {
  console.log('[ProductRoadmap] createTag called:', { data, adminInfo });
  
  try {
    const tagData = {
      name: data.name,
      color: data.color,
      createdAt: serverTimestamp(),
    };
    
    console.log('[ProductRoadmap] Saving tag to Firestore:', tagData);
    const docRef = await addDoc(collection(db, TAGS_COLLECTION), tagData);
    console.log('[ProductRoadmap] Tag saved with ID:', docRef.id);

    if (adminInfo) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'CREATE',
        targetEntity: 'ProductTag',
        targetId: docRef.id,
        details: `Created tag: "${data.name}"`,
      });
    }

    return docRef.id;
  } catch (error) {
    console.error('[ProductRoadmap] Error creating tag:', error);
    throw error;
  }
}

/**
 * Update a tag
 */
export async function updateTag(
  tagId: string,
  data: Partial<Omit<ProductTag, 'id' | 'createdAt'>>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const docRef = doc(db, TAGS_COLLECTION, tagId);
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.color !== undefined) updateData.color = data.color;

    await updateDoc(docRef, updateData);

    if (adminInfo) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'ProductTag',
        targetId: tagId,
        details: `Updated tag`,
      });
    }
  } catch (error) {
    console.error('Error updating tag:', error);
    throw error;
  }
}

/**
 * Delete a tag
 */
export async function deleteTag(
  tagId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    await deleteDoc(doc(db, TAGS_COLLECTION, tagId));

    if (adminInfo) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'DELETE',
        targetEntity: 'ProductTag',
        targetId: tagId,
        details: `Deleted tag`,
      });
    }
  } catch (error) {
    console.error('Error deleting tag:', error);
    throw error;
  }
}

// ============ FEEDBACK ============

/**
 * Get all user feedback
 */
export async function getAllFeedback(): Promise<UserFeedback[]> {
  try {
    const q = query(collection(db, FEEDBACK_COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => normalizeFeedback(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching feedback:', error);
    throw error;
  }
}

/**
 * Get unconverted feedback
 */
export async function getUnconvertedFeedback(): Promise<UserFeedback[]> {
  try {
    const q = query(
      collection(db, FEEDBACK_COLLECTION),
      where('isConverted', '==', false),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => normalizeFeedback(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching unconverted feedback:', error);
    throw error;
  }
}

/**
 * Create user feedback
 */
export async function createFeedback(
  data: Omit<UserFeedback, 'id' | 'createdAt' | 'isConverted'>
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, FEEDBACK_COLLECTION), {
      content: data.content,
      userId: data.userId || null,
      userName: data.userName || null,
      userEmail: data.userEmail || null,
      category: data.category || null,
      isConverted: false,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating feedback:', error);
    throw error;
  }
}

/**
 * Convert feedback to a task
 */
export async function convertFeedbackToTask(
  feedbackId: string,
  taskData: Partial<ProductTask>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<string> {
  try {
    const feedback = await getDoc(doc(db, FEEDBACK_COLLECTION, feedbackId));
    if (!feedback.exists()) throw new Error('Feedback not found');

    const feedbackData = normalizeFeedback(feedback.id, feedback.data());

    // Create task from feedback
    const taskId = await createTask(
      {
        title: taskData.title || `משוב: ${feedbackData.content.slice(0, 50)}...`,
        description: feedbackData.content + (taskData.description ? `\n\n${taskData.description}` : ''),
        source: 'user',
        priority: taskData.priority || 'medium',
        status: taskData.status || 'backlog',
        tags: taskData.tags || [],
        feedbackId: feedbackId,
        assignedTo: taskData.assignedTo,
        assignedToName: taskData.assignedToName,
      },
      adminInfo
    );

    // Mark feedback as converted
    await updateDoc(doc(db, FEEDBACK_COLLECTION, feedbackId), {
      isConverted: true,
      convertedTaskId: taskId,
    });

    return taskId;
  } catch (error) {
    console.error('Error converting feedback to task:', error);
    throw error;
  }
}

// ============ STATS ============

/**
 * Get roadmap stats for dashboard
 */
export async function getRoadmapStats(): Promise<{
  totalTasks: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  pendingFeedback: number;
}> {
  try {
    const tasks = await getAllTasks();
    const feedback = await getUnconvertedFeedback();

    const byStatus: Record<TaskStatus, number> = {
      backlog: 0,
      planned: 0,
      in_progress: 0,
      review: 0,
      done: 0,
      archived: 0,
    };

    const byPriority: Record<TaskPriority, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    tasks.forEach(task => {
      byStatus[task.status]++;
      byPriority[task.priority]++;
    });

    return {
      totalTasks: tasks.length,
      byStatus,
      byPriority,
      pendingFeedback: feedback.length,
    };
  } catch (error) {
    console.error('Error getting roadmap stats:', error);
    throw error;
  }
}
