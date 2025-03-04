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
