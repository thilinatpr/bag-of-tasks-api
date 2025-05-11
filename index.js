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
  // Check if tasks table has data
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .limit(1);
    
  if (tasksError) {
    console.error('Error checking tasks:', tasksError);
    return;
  }
  
  // If no tasks, add a sample one
  if (tasks.length === 0) {
    const { error } = await supabase
      .from('tasks')
      .insert([{
        title: 'Sample Task',
        duration: 25,
        tags: ['quick-win']
      }]);
      
    if (error) console.error('Error adding sample task:', error);
  }
};

// Initialize data on startup
initializeData().catch(console.error);

// Routes
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
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks', details: error.message });
  }
});

// Add a new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, duration, tags } = req.body;
    
    if (!title || !duration) {
      return res.status(400).json({ error: 'Title and duration are required' });
    }
    
    const taskTags = Array.isArray(tags) && tags.length > 0 ? tags : ['general'];
    
    const { data, error } = await supabase
      .from('tasks')
      .insert([{ title, duration, tags: taskTags }])
      .select()
      .single();
      
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error adding task:', error);
    res.status(500).json({ error: 'Failed to add task', details: error.message });
  }
});

// Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task', details: error.message });
  }
});

// Complete a task
app.post('/api/tasks/complete', async (req, res) => {
  try {
    const { taskId } = req.body;
    
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }
    
    // Start a transaction to update stats and delete task
    const { data: stats, error: statsError } = await supabase
      .from('stats')
      .update({ completed_tasks: supabase.rpc('increment', { x: 1 }) })
      .eq('id', 'default')
      .select('completed_tasks')
      .single();
      
    if (statsError) throw statsError;
    
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);
      
    if (deleteError) throw deleteError;
    
    res.status(200).json({ completedTasks: stats.completed_tasks });
  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ error: 'Failed to complete task', details: error.message });
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
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});