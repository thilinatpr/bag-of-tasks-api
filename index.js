const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Set up Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());

// Initialize with sample data if empty
const initializeData = async () => {
  try {
    // Check if stats table has the default record
    const { data: stats, error: statsError } = await supabase
      .from('stats')
      .select('*')
      .eq('id', 'default')
      .single();
    
    if (statsError || !stats) {
      console.log('Creating default stats record...');
      const { error } = await supabase
        .from('stats')
        .insert([{ id: 'default', completed_tasks: 0 }]);
        
      if (error) {
        console.error('Error creating stats record:', error);
        throw error;
      }
      console.log('Default stats record created');
    }
    
    // Check if tasks table has data
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .limit(1);
      
    if (tasksError) {
      console.error('Error checking tasks:', tasksError);
      throw tasksError;
    }
    
    // If no tasks, add a sample one
    if (tasks.length === 0) {
      console.log('Adding sample task...');
      const { error } = await supabase
        .from('tasks')
        .insert([{
          title: 'Sample Task',
          duration: 25,
          tags: ['quick-win']
        }]);
        
      if (error) {
        console.error('Error adding sample task:', error);
        throw error;
      }
      console.log('Sample task added');
    }
  } catch (error) {
    console.error('Initialization error:', error);
    throw error;
  }
};

// Initialize data on startup
initializeData()
  .then(() => console.log('Data initialization complete'))
  .catch(error => console.error('Data initialization failed:', error));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching tasks:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Failed to fetch tasks',
      details: error.message 
    });
  }
});

// Add a new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, duration, tags } = req.body;
    
    if (!title || !duration) {
      return res.status(400).json({ 
        error: 'Title and duration are required',
        received: { title, duration }
      });
    }
    
    const taskTags = Array.isArray(tags) && tags.length > 0 ? tags : ['general'];
    
    const { data, error } = await supabase
      .from('tasks')
      .insert([{ 
        title, 
        duration: parseInt(duration), 
        tags: taskTags 
      }])
      .select()
      .single();
      
    if (error) throw error;
    
    console.log('Task added:', data.id);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error adding task:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Failed to add task',
      details: error.message 
    });
  }
});

// Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify task exists first
    const { data: task, error: findError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();
      
    if (findError || !task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    
    console.log('Task deleted:', id);
    res.status(200).json({ 
      message: 'Task deleted successfully',
      deletedTask: task 
    });
  } catch (error) {
    console.error('Error deleting task:', {
      message: error.message,
      stack: error.stack,
      taskId: req.params.id,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Failed to delete task',
      details: error.message 
    });
  }
});

// Complete a task (mark as done and increment stats)
app.post('/api/tasks/complete', async (req, res) => {
  try {
    const { taskId } = req.body;
    
    if (!taskId) {
      return res.status(400).json({ 
        error: 'Task ID is required',
        received: req.body 
      });
    }
    
    // Verify task exists first
    const { data: task, error: findError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();
      
    if (findError || !task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // First try to increment existing stats
    const { data: stats, error: statsError } = await supabase
      .from('stats')
      .update({ completed_tasks: supabase.rpc('increment', { x: 1 }) })
      .eq('id', 'default')
      .select('completed_tasks')
      .single();
      
    if (statsError) {
      console.log('Stats record not found, creating new one...');
      
      // If stats record doesn't exist, create it
      const { data: newStats, error: createError } = await supabase
        .from('stats')
        .insert([{ id: 'default', completed_tasks: 1 }])
        .select('completed_tasks')
        .single();
        
      if (createError) throw createError;
      
      // Now delete the task
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
        
      if (deleteError) throw deleteError;
      
      console.log('Task completed with new stats record:', taskId);
      return res.status(200).json({ 
        completedTasks: newStats.completed_tasks,
        task: task
      });
    }
    
    // If stats update was successful, delete the task
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);
      
    if (deleteError) throw deleteError;
    
    console.log('Task completed:', taskId);
    res.status(200).json({ 
      completedTasks: stats.completed_tasks,
      task: task
    });
  } catch (error) {
    console.error('Error completing task:', {
      message: error.message,
      stack: error.stack,
      taskId: req.body.taskId,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Failed to complete task',
      details: error.message 
    });
  }
});

// Get stats
app.get('/api/tasks/stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stats')
      .select('completed_tasks')
      .eq('id', 'default')
      .single();
      
    if (error) throw error;
    
    if (!data) {
      // If no stats record exists, create one
      const { data: newStats, error: createError } = await supabase
        .from('stats')
        .insert([{ id: 'default', completed_tasks: 0 }])
        .select('completed_tasks')
        .single();
        
      if (createError) throw createError;
      return res.status(200).json(newStats);
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching stats:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Failed to fetch stats',
      details: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});