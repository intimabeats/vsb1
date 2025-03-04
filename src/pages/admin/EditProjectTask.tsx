// src/pages/admin/EditProjectTask.tsx
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import {
  CheckCircle,
  XCircle,
  Clock,
  File,
  User,
  Calendar,
  Check,
  X,
  FileText,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  MoreVertical,
  CornerUpLeft,
  Info,
  Edit,
  Eye,
  Award,
  BarChart2,
  Briefcase,
  Tag,
  CornerDownRight,
  MessageSquare,
  Send,
  Paperclip,
  Download,
  Plus,
  Trash2,
  Save,
  HelpCircle,
  Flag,
  Users
} from 'lucide-react'
import { taskService } from '../../services/TaskService'
import { projectService } from '../../services/ProjectService'
import { userManagementService } from '../../services/UserManagementService'
import { TaskSchema, TaskAction } from '../../types/firestore-schema'
import { ActionView } from '../../components/ActionView'
import { ActionDocument } from '../../components/ActionDocument'
import { systemSettingsService } from '../../services/SystemSettingsService'
import { actionTemplateService } from '../../services/ActionTemplateService';
import { deepCopy } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext'

export const EditProjectTask: React.FC = () => {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>()
  const navigate = useNavigate()
  const { currentUser } = useAuth()

  // Basic form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    projectId: projectId || '',
    assignedTo: '',
    priority: 'medium' as TaskSchema['priority'],
    startDate: new Date().toISOString().split('T')[0], // Added start date
    dueDate: new Date().toISOString().split('T')[0],
    difficultyLevel: 5,
    actions: [] as TaskAction[]  // Initialize actions
  })

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({})
  const [isLoading, setIsLoading] = useState(true)
  const [success, setSuccess] = useState<string | null>(null)

  // Data state
  const [projects, setProjects] = useState<{ id: string, name: string }[]>([])
  const [users, setUsers] = useState<{ id: string, name: string }[]>([])
  const [coinsReward, setCoinsReward] = useState(0)
  const [templates, setTemplates] = useState<{ id: string, title: string, description: string }[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [previewAction, setPreviewAction] = useState<TaskAction | null>(null)
  const [showTemplateInfo, setShowTemplateInfo] = useState(false)
  
  // New state for managing steps
  const [currentStep, setCurrentStep] = useState(1)
  const [totalSteps, setTotalSteps] = useState(1)
  const [actionsByStep, setActionsByStep] = useState<{[key: number]: TaskAction[]}>({
    1: []
  })

  // Load task data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!taskId) {
          throw new Error('Task ID is required');
        }

        // Fetch task data
        const taskData = await taskService.getTaskById(taskId);

        // Fetch project name
        if (projectId) {
          const project = await projectService.getProjectById(projectId);
          if (project.name) {
            // Project exists, continue
          }
        }

        // Fetch users, settings, and templates
        const [usersRes, settings, templatesRes] = await Promise.all([
          userManagementService.fetchUsers(),
          systemSettingsService.getSettings(),
          actionTemplateService.fetchActionTemplates()
        ]);

        // Organize actions into steps
        const actionsByStepMap: {[key: number]: TaskAction[]} = {};
        let maxStep = 1;
        
        taskData.actions.forEach(action => {
          const stepNumber = action.data?.stepNumber || 1;
          if (!actionsByStepMap[stepNumber]) {
            actionsByStepMap[stepNumber] = [];
          }
          actionsByStepMap[stepNumber].push(action);
          
          if (stepNumber > maxStep) {
            maxStep = stepNumber;
          }
        });
        
        setTotalSteps(maxStep);
        setActionsByStep(actionsByStepMap);
        setCurrentStep(1); // Start at step 1

        // Set form data from task
        setFormData({
          title: taskData.title,
          description: taskData.description,
          projectId: taskData.projectId,
          assignedTo: taskData.assignedTo,
          priority: taskData.priority,
          startDate: new Date(taskData.startDate || Date.now()).toISOString().split('T')[0],
          dueDate: new Date(taskData.dueDate).toISOString().split('T')[0],
          difficultyLevel: taskData.difficultyLevel || 5,
          actions: taskData.actions || []
        });

        // Set other state
        setProjects(await fetchProjects());
        setUsers(usersRes.data.map(u => ({ id: u.id, name: u.name })));
        setCoinsReward(Math.round(settings.taskCompletionBase * taskData.difficultyLevel * settings.complexityMultiplier));
        
        // Enhanced template data with descriptions
        setTemplates(templatesRes.map(t => ({ 
          id: t.id, 
          title: t.title,
          description: t.description || 'No description provided'
        })));

      } catch (err: any) {
        console.error('Error loading task data:', err);
        setError(err.message || 'Failed to load task data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [taskId, projectId]);

  // Fetch projects helper function
  const fetchProjects = async () => {
    const projectsResponse = await projectService.fetchProjects();
    return projectsResponse.data.map(p => ({ id: p.id, name: p.name }));
  };

  // Load template preview when a template is selected
  useEffect(() => {
    if (selectedTemplate) {
      actionTemplateService.getActionTemplateById(selectedTemplate)
        .then(template => {
          setPreviewTemplate(template);
        })
        .catch(err => {
          console.error("Error loading template preview:", err);
          setError("Failed to load template preview");
        });
    } else {
      setPreviewTemplate(null);
    }
  }, [selectedTemplate]);

  // Form validation
  const validateForm = () => {
    const errors: { [key: string]: string } = {}
    if (!formData.title.trim()) errors.title = 'Title is required'
    if (!formData.description.trim()) errors.description = 'Description is required'
    if (!formData.projectId) errors.projectId = 'Project is required'
    if (!formData.assignedTo) errors.assignedTo = 'At least one assignee is required'
    if (!formData.startDate) errors.startDate = 'Start date is required'
    if (!formData.dueDate) errors.dueDate = "Due date is required"

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Event handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))

    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  // Add action from template
  const handleAddActionFromTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      setLoading(true);
      const fullTemplate = await actionTemplateService.getActionTemplateById(selectedTemplate);
      if (!fullTemplate) {
        setError("Template not found");
        return;
      }

      // Create a new action with step information
      const newAction: TaskAction = {
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        title: fullTemplate.title,
        type: 'document',
        completed: false,
        description: fullTemplate.elements.map(e => e.description || '').filter(Boolean).join(' '),
        data: { 
          steps: deepCopy(fullTemplate.elements),
          stepNumber: currentStep // Add step number to the action data
        },
      };

      // Update actions for the current step
      setActionsByStep(prev => {
        const currentStepActions = prev[currentStep] || [];
        return {
          ...prev,
          [currentStep]: [...currentStepActions, newAction]
        };
      });
      
      // Show preview of the newly added action
      setPreviewAction(newAction);
      
      // Reset the selected template after adding
      setSelectedTemplate('');
      setSuccess("Action template added successfully");
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error("Error adding action from template:", error);
      setError("Failed to add action from template.");
    } finally {
      setLoading(false);
    }
  };

  // Remove action
  const handleRemoveAction = (actionId: string) => {
    setActionsByStep(prev => {
      const updatedSteps = { ...prev };
      
      // Find which step contains this action
      Object.keys(updatedSteps).forEach(stepKey => {
        const stepNum = parseInt(stepKey);
        updatedSteps[stepNum] = updatedSteps[stepNum].filter(action => action.id !== actionId);
      });
      
      return updatedSteps;
    });
    
    // Clear preview if the removed action was being previewed
    if (previewAction && previewAction.id === actionId) {
      setPreviewAction(null);
    }
  };

  // Add a new step
  const handleAddStep = () => {
    const newStepNumber = totalSteps + 1;
    setTotalSteps(newStepNumber);
    setActionsByStep(prev => ({
      ...prev,
      [newStepNumber]: []
    }));
    setCurrentStep(newStepNumber); // Move to the new step
  };

  // Remove a step
  const handleRemoveStep = (stepToRemove: number) => {
    if (totalSteps <= 1) return; // Don't remove the last step
    
    setActionsByStep(prev => {
      const updatedSteps = { ...prev };
      
      // Remove the specified step
      delete updatedSteps[stepToRemove];
      
      // Renumber the steps after the removed one
      for (let i = stepToRemove + 1; i <= totalSteps; i++) {
        if (updatedSteps[i]) {
          updatedSteps[i - 1] = updatedSteps[i];
          
          // Update step numbers in actions
          updatedSteps[i - 1] = updatedSteps[i - 1].map(action => ({
            ...action,
            data: {
              ...action.data,
              stepNumber: i - 1
            }
          }));
          
          delete updatedSteps[i];
        }
      }
      
      return updatedSteps;
    });
    
    setTotalSteps(prev => prev - 1);
    setCurrentStep(prev => prev > 1 ? prev - 1 : 1); // Move to previous step or stay at 1
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      if (!taskId) {
        throw new Error('Task ID is missing');
      }
      
      // Combine all actions from all steps into a flat array
      const allActions: TaskAction[] = [];
      for (let i = 1; i <= totalSteps; i++) {
        if (actionsByStep[i]) {
          // Add step information to each action
          const actionsWithStepInfo = actionsByStep[i].map(action => ({
            ...action,
            data: {
              ...action.data,
              stepNumber: i
            }
          }));
          allActions.push(...actionsWithStepInfo);
        }
      }
      
      // Calculate coins reward based on difficulty level
      const calculatedCoinsReward = Math.round(
        formData.difficultyLevel * 
        (await systemSettingsService.getSettings()).taskCompletionBase * 
        (await systemSettingsService.getSettings()).complexityMultiplier
      );

      const updateData = {
        ...formData,
        startDate: new Date(formData.startDate).getTime(),
        dueDate: new Date(formData.dueDate).getTime(),
        coinsReward: calculatedCoinsReward,
        actions: allActions
      };

      await taskService.updateTask(taskId, updateData);
      setSuccess("Task updated successfully!");
      
      // Auto-hide success message and navigate after a delay
      setTimeout(() => {
        navigate(`/admin/projects/${projectId}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update task');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to render field preview based on type
  const renderFieldPreview = (field: any) => {
    switch (field.type) {
      case 'text':
        return (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
            <input 
              type="text" 
              disabled 
              placeholder={field.placeholder || "Short text input"} 
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-500"
            />
            {field.description && <p className="mt-1 text-xs text-gray-500">{field.description}</p>}
          </div>
        );
      case 'long_text':
        return (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
            <textarea 
              disabled 
              placeholder={field.placeholder || "Long text input"} 
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-500 h-20"
            ></textarea>
            {field.description && <p className="mt-1 text-xs text-gray-500">{field.description}</p>}
          </div>
        );
      case 'date':
        return (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
            <input 
              type="date" 
              disabled 
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-500"
            />
            {field.description && <p className="mt-1 text-xs text-gray-500">{field.description}</p>}
          </div>
        );
      case 'select':
        return (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
            <select 
              disabled 
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-500"
            >
              <option value="">Selecione uma opção</option>
              {field.options?.map((option: string, i: number) => (
                <option key={i} value={option}>{option}</option>
              ))}
            </select>
            {field.description && <p className="mt-1 text-xs text-gray-500">{field.description}</p>}
          </div>
        );
      case 'checkbox':
        return (
          <div className="mb-3">
            <div className="flex items-center">
              <input
                type="checkbox"
                disabled
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-700">{field.label}</label>
            </div>
            {field.description && <p className="mt-1 text-xs text-gray-500 ml-6">{field.description}</p>}
          </div>
        );
      case 'file_upload':
        return (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
            <div className="border border-dashed border-gray-300 rounded-md p-4 text-center bg-gray-50">
              <p className="text-sm text-gray-500">Clique para fazer upload ou arraste arquivos</p>
            </div>
            {field.description && <p className="mt-1 text-xs text-gray-500">{field.description}</p>}
          </div>
        );
      case 'info':
        return (
          <div className="mb-3 p-3 bg-blue-50 border-l-4 border-blue-500 rounded-md">
            <h5 className="font-medium text-blue-700">{field.label}</h5>
            <p className="text-sm text-blue-600 mt-1">{field.description}</p>
            {field.hasAttachments && (
              <div className="mt-2 p-2 bg-white rounded border border-blue-200">
                <p className="text-sm text-blue-600 flex items-center">
                  <Upload size={14} className="mr-1" /> Anexos serão exibidos aqui
                </p>
              </div>
            )}
          </div>
        );
      default:
        return <div className="mb-3 text-sm text-gray-500">Tipo de campo não suportado: {field.type}</div>;
    }
  };

  return (
    <Layout role={currentUser?.role || 'admin'}>
      <div className="container mx-auto p-6">
        <div className="flex items-center mb-6">
          <button 
            onClick={() => navigate(-1)} 
            className="mr-4 p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center">
            <Edit className="mr-3 text-blue-600" />
            Editar Tarefa
          </h1>
        </div>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg flex items-center mb-6">
            <AlertTriangle className="mr-3 flex-shrink-0" size={20} />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-lg flex items-center mb-6">
            <CheckCircle className="mr-3 flex-shrink-0" size={20} />
            <p>{success}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Informações da Tarefa</h2>
            <p className="text-sm text-gray-600">Edite os detalhes da tarefa</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <FileText size={16} className="mr-2 text-blue-600" />
                    Título
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Digite o título da tarefa"
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${formErrors.title ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500 border-gray-300'}`}
                  />
                  {formErrors.title && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.title}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Users size={16} className="mr-2 text-blue-600" />
                    Responsável
                  </label>
                  <select
                    name="assignedTo"
                    value={formData.assignedTo}
                    onChange={handleChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${formErrors.assignedTo ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500 border-gray-300'}`}
                  >
                    <option value="">Selecione um responsável</option>
                    {users && Object.entries(users).map(([id, user]) => (
                      <option key={id} value={id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.assignedTo && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.assignedTo}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Flag size={16} className="mr-2 text-blue-600" />
                    Prioridade
                  </label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <FileText size={16} className="mr-2 text-blue-600" />
                    Descrição
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Descreva a tarefa em detalhes"
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 h-24 ${formErrors.description ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500 border-gray-300'}`}
                  />
                  {formErrors.description && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                      <Calendar size={16} className="mr-2 text-blue-600" />
                      Data de Início
                    </label>
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleChange}
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${formErrors.startDate ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500 border-gray-300'}`}
                    />
                    {formErrors.startDate && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.startDate}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                      <Clock size={16} className="mr-2 text-blue-600" />
                      Data de Vencimento
                    </label>
                    <input
                      type="date"
                      name="dueDate"
                      value={formData.dueDate}
                      onChange={handleChange}
                      className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${formErrors.dueDate ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500 border-gray-300'}`}
                    />
                    {formErrors.dueDate && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.dueDate}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <Award size={16} className="mr-2 text-blue-600" />
                    Nível de Dificuldade ({formData.difficultyLevel})
                  </label>
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-gray-500">Fácil</span>
                    <input
                      type="range"
                      min="2"
                      max="9"
                      step="1"
                      value={formData.difficultyLevel}
                      onChange={(e) => setFormData(prev => ({ ...prev, difficultyLevel: parseInt(e.target.value) }))}
                      className="flex-grow h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-500">Difícil</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-500">Recompensa: {coinsReward} moedas</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Steps Navigation */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-800">Etapas da Tarefa</h3>
                <button
                  type="button"
                  onClick={handleAddStep}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center text-sm"
                >
                  <Plus size={16} className="mr-1" /> Adicionar Etapa
                </button>
              </div>
              
              {/* Step Tabs */}
              <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-200 pb-4">
                {Array.from({ length: totalSteps }, (_, i) => i + 1).map(step => (
                  <div key={step} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(step)}
                      className={`px-4 py-2 rounded-lg transition ${
                        currentStep === step
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Etapa {step}
                    </button>
                    {totalSteps > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(step)}
                        className="ml-1 p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                        title="Remover Etapa"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Current Step Content */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">
                  Etapa {currentStep}: Ações
                </h4>
                
                {/* Action Templates Section */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
                  <div className="flex flex-col space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700">
                        Selecione um Modelo de Ação
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowTemplateInfo(!showTemplateInfo)}
                        className="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50"
                      >
                        <HelpCircle size={16} />
                      </button>
                    </div>
                    
                    {showTemplateInfo && (
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800 mb-2">
                        <p className="font-medium mb-1">O que são modelos de ação?</p>
                        <p>Modelos de ação definem os campos que o usuário deverá preencher ao realizar uma tarefa. 
                        Ao adicionar um modelo, você está criando um formulário estruturado que o responsável pela tarefa deverá completar.</p>
                      </div>
                    )}
                    
                    <div className="flex space-x-2">
                      <select
                        value={selectedTemplate}
                        onChange={(e) => setSelectedTemplate(e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Selecione um Modelo</option>
                        {templates.map(template => (
                          <option key={template.id} value={template.id}>
                            {template.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddActionFromTemplate}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center"
                        disabled={!selectedTemplate}
                      >
                        <Plus size={18} className="mr-1" /> Adicionar
                      </button>
                    </div>
                    
                    {selectedTemplate && previewTemplate && (
                      <div className="mt-2">
                        <div className="bg-white p-4 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium text-gray-800 flex items-center">
                              <Eye size={16} className="mr-2 text-blue-600" />
                              Visualização do Modelo
                            </h3>
                          </div>
                          <p className="text-sm text-gray-600 mb-4">{previewTemplate.description}</p>
                          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            {previewTemplate.elements?.map((element: any, index: number) => (
                              <div key={index}>
                                {renderFieldPreview(element)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Display Added Actions for Current Step */}
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {(!actionsByStep[currentStep] || actionsByStep[currentStep].length === 0) ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                      <Info className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                      <p className="text-gray-500">Adicione ações do modelo para esta etapa</p>
                      <p className="text-sm text-gray-400 mt-1">As ações definem o que o responsável precisará fazer para completar a tarefa</p>
                    </div>
                  ) : (
                    actionsByStep[currentStep].map((action) => (
                      <div key={action.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center">
                            <div className="bg-blue-100 p-2 rounded-full mr-3">
                              <FileText size={16} className="text-blue-600" />
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">{action.title}</h4>
                              <p className="text-sm text-gray-500 line-clamp-1">
                                {action.type === 'document' 
                                  ? `${action.data?.steps?.length || 0} campos para preencher` 
                                  : action.description}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAction(action.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50"
                            title="Remover ação"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`px-6 py-2 rounded-lg text-white transition flex items-center ${loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={18} />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2" size={18} /> Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  )
}
