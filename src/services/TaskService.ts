// src/services/TaskService.ts
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryConstraint
} from 'firebase/firestore'
import { auth, storage } from '../config/firebase'
import { TaskSchema, ProjectSchema, TaskAction } from '../types/firestore-schema'
import { systemSettingsService } from './SystemSettingsService'
import { ref, uploadBytes, getDownloadURL, listAll, getMetadata, deleteObject } from 'firebase/storage'
import { notificationService } from './NotificationService'
import { projectService } from './ProjectService'
import { userManagementService } from './UserManagementService'
import { activityService } from './ActivityService'
import { actionTemplateService } from './ActionTemplateService'

export class TaskService {
  private db = getFirestore()

  // Criar nova tarefa
  async createTask(
    taskData: Omit<TaskSchema, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<TaskSchema> {
    try {
      const taskRef = doc(collection(this.db, 'tasks'))

      const newTask: TaskSchema = {
        id: taskRef.id,
        ...taskData,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      await setDoc(taskRef, newTask)

      // Notificar usuário responsável
      if (taskData.assignedTo) {
        await notificationService.createNotification(
          taskData.assignedTo,
          {
            type: 'task_assigned',
            title: 'Nova Tarefa Atribuída',
            message: `Você foi atribuído à tarefa "${taskData.title}"`,
            relatedEntityId: taskRef.id
          }
        )
      }

      // Log activity
      await activityService.logActivity({
        userId: auth.currentUser?.uid || '',
        userName: auth.currentUser?.displayName || 'Unknown User',
        type: 'task_created',
        projectId: taskData.projectId,
        taskId: taskRef.id,
        projectName: (await projectService.getProjectById(taskData.projectId)).name,
        taskName: taskData.title,
        timestamp: Date.now()
      });

      return newTask
    } catch (error) {
      console.error('Erro ao criar tarefa:', error)
      throw error
    }
  }

  // Atualizar tarefa
  async updateTask(
    taskId: string,
    updates: Partial<TaskSchema>
  ): Promise<TaskSchema> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId)
      const taskDoc = await getDoc(taskRef)

      if (!taskDoc.exists()) {
        throw new Error('Tarefa não encontrada')
      }

      const currentTask = taskDoc.data() as TaskSchema
      const updatedTask = {
        ...currentTask,
        ...updates,
        updatedAt: Date.now()
      }

      await updateDoc(taskRef, {
        ...updates,
        updatedAt: Date.now()
      })

      // Notificar sobre mudança de status
      if (updates.status && updates.status !== currentTask.status) {
        // Notificar criador da tarefa
        if (currentTask.createdBy && currentTask.createdBy !== auth.currentUser?.uid) {
          await notificationService.createNotification(
            currentTask.createdBy,
            {
              type: 'task_updated',
              title: 'Tarefa Atualizada',
              message: `A tarefa "${currentTask.title}" foi atualizada para "${updates.status}"`,
              relatedEntityId: taskId
            }
          )
        }

        // Log activity for status update
        await activityService.logActivity({
          userId: auth.currentUser?.uid || '',
          userName: auth.currentUser?.displayName || 'Unknown User',
          type: 'task_status_update',
          projectId: currentTask.projectId,
          taskId: taskId,
          projectName: (await projectService.getProjectById(currentTask.projectId)).name,
          taskName: currentTask.title,
          newStatus: updates.status,
          timestamp: Date.now()
        });
      }

      // Se a tarefa foi concluída, conceder recompensa
      if (updates.status === 'completed' && currentTask.status !== 'completed') {
        // Atualizar moedas do usuário
        if (currentTask.assignedTo) {
          await userManagementService.updateUserCoins(
            currentTask.assignedTo,
            currentTask.coinsReward
          )

          // Notificar sobre recompensa
          await notificationService.createNotification(
            currentTask.assignedTo,
            {
              type: 'reward_earned',
              title: 'Recompensa Recebida',
              message: `Você ganhou ${currentTask.coinsReward} moedas por concluir a tarefa "${currentTask.title}"`,
              relatedEntityId: taskId
            }
          )
        }

        // Log activity for task completion
        await activityService.logActivity({
          userId: auth.currentUser?.uid || '',
          userName: auth.currentUser?.displayName || 'Unknown User',
          type: 'task_completed',
          projectId: currentTask.projectId,
          taskId: taskId,
          projectName: (await projectService.getProjectById(currentTask.projectId)).name,
          taskName: currentTask.title,
          timestamp: Date.now()
        });
      }

      return updatedTask
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error)
      throw error
    }
  }

  // Excluir tarefa
  async deleteTask(taskId: string): Promise<void> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId)
      await deleteDoc(taskRef)
    } catch (error) {
      console.error('Erro ao excluir tarefa:', error)
      throw error
    }
  }

  // Buscar tarefa por ID
  async getTaskById(taskId: string): Promise<TaskSchema> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId)
      const taskDoc = await getDoc(taskRef)

      if (!taskDoc.exists()) {
        throw new Error('Tarefa não encontrada')
      }

      return {
        id: taskDoc.id,
        ...taskDoc.data()
      } as TaskSchema
    } catch (error) {
      console.error('Erro ao buscar tarefa:', error)
      throw error
    }
  }

  // Método para buscar tarefas com filtros e paginação
  async fetchTasks(options?: {
    projectId?: string;
    assignedTo?: string;
    status?: TaskSchema['status'];
    limit?: number;
    page?: number;
  }): Promise<{
    data: TaskSchema[];
    totalTasks: number;
    totalPages: number;
  }> {
    try {
      // Construir consulta base
      let queryConstraints: QueryConstraint[] = [];
      
      // Adicionar filtros se fornecidos
      if (options?.projectId) {
        queryConstraints.push(where('projectId', '==', options.projectId));
      }
      
      if (options?.assignedTo) {
        queryConstraints.push(where('assignedTo', '==', options.assignedTo));
      }
      
      if (options?.status) {
        queryConstraints.push(where('status', '==', options.status));
      }
      
      // Adicionar ordenação por data de criação (mais recentes primeiro)
      queryConstraints.push(orderBy('createdAt', 'desc'));
      
      // Executar consulta
      const tasksCollection = collection(this.db, 'tasks');
      const q = query(tasksCollection, ...queryConstraints);
      const snapshot = await getDocs(q);
      
      // Extrair dados
      const allTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as TaskSchema));
      
      // Aplicar paginação
      const limitVal = options?.limit || 10;
      const pageVal = options?.page || 1;
      const startIndex = (pageVal - 1) * limitVal;
      const endIndex = Math.min(startIndex + limitVal, allTasks.length);
      
      const paginatedTasks = allTasks.slice(startIndex, endIndex);
      const totalPages = Math.ceil(allTasks.length / limitVal);
      
      return {
        data: paginatedTasks,
        totalTasks: allTasks.length,
        totalPages: totalPages || 1 // Garantir pelo menos 1 página
      };
    } catch (error) {
      console.error('Erro ao buscar tarefas:', error);
      throw error;
    }
  }

  // Completar ação de tarefa
  async completeTaskAction(
    taskId: string,
    actionId: string,
    data?: any
  ): Promise<void> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId)
      const taskDoc = await getDoc(taskRef)

      if (!taskDoc.exists()) {
        throw new Error('Tarefa não encontrada')
      }

      const task = taskDoc.data() as TaskSchema
      const updatedActions = task.actions.map(action => {
        if (action.id === actionId) {
          return {
            ...action,
            ...data, // Merge any provided data
            completed: true,
            completedAt: Date.now(),
            completedBy: auth.currentUser?.uid
          }
        }
        return action
      })

      await updateDoc(taskRef, {
        actions: updatedActions,
        updatedAt: Date.now()
      })

      // Verificar se todas as ações foram concluídas
      const allActionsCompleted = updatedActions.every(action => action.completed)
      if (allActionsCompleted && task.status === 'pending') {
        // Atualizar status da tarefa para 'in_progress'
        await updateDoc(taskRef, {
          status: 'in_progress',
          updatedAt: Date.now()
        })
      }
    } catch (error) {
      console.error('Erro ao completar ação:', error)
      throw error
    }
  }

  // Descompletar ação de tarefa
  async uncompleteTaskAction(
    taskId: string,
    actionId: string
  ): Promise<void> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId)
      const taskDoc = await getDoc(taskRef)

      if (!taskDoc.exists()) {
        throw new Error('Tarefa não encontrada')
      }

      const task = taskDoc.data() as TaskSchema
      const updatedActions = task.actions.map(action => {
        if (action.id === actionId) {
          const { completed, completedAt, completedBy, ...rest } = action
          return {
            ...rest,
            completed: false
          }
        }
        return action
      })

      await updateDoc(taskRef, {
        actions: updatedActions,
        updatedAt: Date.now()
      })

      // Se a tarefa estava concluída ou aguardando aprovação, voltar para em andamento
      if (task.status === 'completed' || task.status === 'waiting_approval') {
        await updateDoc(taskRef, {
          status: 'in_progress',
          updatedAt: Date.now()
        })
      }
    } catch (error) {
      console.error('Erro ao descompletar ação:', error)
      throw error
    }
  }

  // Método atualizado para upload de anexo para tarefa
  async uploadTaskAttachment(
    taskId: string, 
    file: File,
    actionId?: string
  ): Promise<string> {
    try {
      let storagePath = `tasks/${taskId}/attachments/${file.name}`;
      if (actionId) {
        storagePath = `tasks/${taskId}/actions/${actionId}/${file.name}`;
      }
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Erro ao fazer upload de anexo:', error);
      throw error;
    }
  }

  // Novo método para mover arquivos após aprovação da tarefa
  async moveFilesToProjectAfterApproval(taskId: string, projectId: string): Promise<void> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId);
      const taskSnap = await getDoc(taskRef);

      if (!taskSnap.exists()) {
        throw new Error('Tarefa não encontrada');
      }

      const taskData = taskSnap.data() as TaskSchema;

      if (taskData.status !== 'completed') {
        throw new Error('A tarefa deve estar concluída para mover os arquivos');
      }

      // Listar todos os arquivos na pasta da tarefa
      const taskStorageRef = ref(storage, `tasks/${taskId}`);
      
      try {
        const filesList = await listAll(taskStorageRef);
        
        // Processar cada arquivo
        for (const fileRef of filesList.items) {
          try {
            // Obter URL de download e metadados
            const downloadURL = await getDownloadURL(fileRef);
            const response = await fetch(downloadURL);
            const blob = await response.blob();
            
            // Criar referência para o novo local no projeto
            const fileName = fileRef.name;
            const projectFileRef = ref(storage, `projects/${projectId}/files/${fileName}`);
            
            // Fazer upload para o novo local
            await uploadBytes(projectFileRef, blob);
            
            // Obter URL do novo arquivo
            const newFileURL = await getDownloadURL(projectFileRef);
            
            // Adicionar referência do arquivo ao projeto
            await projectService.addFileToProject(projectId, {
              name: fileName,
              url: newFileURL,
              type: blob.type,
              size: blob.size,
              taskId: taskId,
              uploadedAt: Date.now()
            });
            
            // Opcional: Excluir o arquivo original
            // await deleteObject(fileRef);
          } catch (fileError) {
            console.error(`Erro ao processar arquivo ${fileRef.name}:`, fileError);
            // Continue com o próximo arquivo mesmo se houver erro
          }
        }
        
        // Atualizar a tarefa para indicar que os arquivos foram movidos
        await updateDoc(taskRef, {
          filesMovedToProject: true,
          updatedAt: Date.now()
        });
        
      } catch (listError) {
        // Se não houver arquivos, isso não deve interromper o processo
        console.log('Nenhum arquivo encontrado ou erro ao listar arquivos:', listError);
      }

    } catch (error) {
      console.error('Erro ao mover arquivos para o projeto:', error);
      throw error;
    }
  }

  // Adicionar comentário à tarefa
  async addTaskComment(
    taskId: string,
    comment: {
      userId: string;
      text: string;
      attachments?: string[];
    }
  ): Promise<void> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);

      if (!taskDoc.exists()) {
        throw new Error('Tarefa não encontrada');
      }

      const task = taskDoc.data() as TaskSchema;
      const comments = task.comments || [];

      const newComment = {
        id: Date.now().toString(),
        ...comment,
        createdAt: Date.now()
      };

      await updateDoc(taskRef, {
        comments: [...comments, newComment],
        updatedAt: Date.now()
      });

      // Notificar o responsável pela tarefa se o comentário for de outra pessoa
      if (task.assignedTo && task.assignedTo !== comment.userId) {
        await notificationService.createNotification(
          task.assignedTo,
          {
            type: 'task_updated',
            title: 'Novo Comentário',
            message: `Novo comentário na tarefa "${task.title}"`,
            relatedEntityId: taskId
          }
        );
      }
    } catch (error) {
      console.error('Erro ao adicionar comentário:', error);
      throw error;
    }
  }

  // Adicionar subtarefa
  async addSubtask(
    taskId: string,
    subtask: {
      title: string;
    }
  ): Promise<void> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);

      if (!taskDoc.exists()) {
        throw new Error('Tarefa não encontrada');
      }

      const task = taskDoc.data() as TaskSchema;
      const subtasks = task.subtasks || [];

      const newSubtask = {
        id: Date.now().toString(),
        title: subtask.title,
        completed: false
      };

      await updateDoc(taskRef, {
        subtasks: [...subtasks, newSubtask],
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Erro ao adicionar subtarefa:', error);
      throw error;
    }
  }

  // Completar subtarefa
  async completeSubtask(
    taskId: string,
    subtaskId: string
  ): Promise<void> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);

      if (!taskDoc.exists()) {
        throw new Error('Tarefa não encontrada');
      }

      const task = taskDoc.data() as TaskSchema;
      const subtasks = task.subtasks || [];

      const updatedSubtasks = subtasks.map(subtask => {
        if (subtask.id === subtaskId) {
          return {
            ...subtask,
            completed: true,
            completedAt: Date.now()
          };
        }
        return subtask;
      });

      await updateDoc(taskRef, {
        subtasks: updatedSubtasks,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Erro ao completar subtarefa:', error);
      throw error;
    }
  }

  // Adicionar anexo à tarefa
  async addTaskAttachment(
    taskId: string,
    file: File
  ): Promise<string> {
    try {
      const downloadURL = await this.uploadTaskAttachment(taskId, file);
      
      const taskRef = doc(this.db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);

      if (!taskDoc.exists()) {
        throw new Error('Tarefa não encontrada');
      }

      const task = taskDoc.data() as TaskSchema;
      const attachments = task.attachments || [];

      await updateDoc(taskRef, {
        attachments: [...attachments, downloadURL],
        updatedAt: Date.now()
      });

      return downloadURL;
    } catch (error) {
      console.error('Erro ao adicionar anexo:', error);
      throw error;
    }
  }

  // Adicionar ação à tarefa
  async addTaskAction(
    taskId: string,
    action: Omit<TaskAction, 'id' | 'completed' | 'completedAt' | 'completedBy'>
  ): Promise<void> {
    try {
      const taskRef = doc(this.db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);

      if (!taskDoc.exists()) {
        throw new Error('Tarefa não encontrada');
      }

      const task = taskDoc.data() as TaskSchema;
      const actions = task.actions || [];

      const newAction: TaskAction = {
        id: Date.now().toString(),
        ...action,
        completed: false
      };

      await updateDoc(taskRef, {
        actions: [...actions, newAction],
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Erro ao adicionar ação:', error);
      throw error;
    }
  }

  // Adicionar ação a partir de um template
  async addTaskActionFromTemplate(
    taskId: string,
    templateId: string,
    stepNumber: number = 1
  ): Promise<void> {
    try {
      const template = await actionTemplateService.getActionTemplateById(templateId);
      
      if (!template) {
        throw new Error('Template não encontrado');
      }

      const taskAction: Omit<TaskAction, 'id' | 'completed' | 'completedAt' | 'completedBy'> = {
        title: template.title,
        type: 'document',
        description: template.description || template.title,
        data: {
          steps: template.elements,
          stepNumber: stepNumber
        }
      };

      await this.addTaskAction(taskId, taskAction);
    } catch (error) {
      console.error('Erro ao adicionar ação do template:', error);
      throw error;
    }
  }
}

export const taskService = new TaskService()
