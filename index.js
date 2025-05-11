const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase client setup
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    db: 'connected',
    timestamp: new Date().toISOString()
  });
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
    console.error('GET /tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Add new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, duration, tags = ['general'] } = req.body;
    
    if (!title || !duration) {
      return res.status(400).json({ error: 'Title and duration are required' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert([{ title, duration, tags }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('POST /tasks error:', error);
    res.status(500).json({ error: 'Failed to add task' });
  }
});

// Complete task
app.post('/api/tasks/complete', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: 'Task ID required' });

    // Verify task exists
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Increment stats and delete task in transaction
    const { data: stats } = await supabase
      .from('stats')
      .update({ completed_tasks: supabase.rpc('increment', { x: 1 }) })
      .eq('id', 'default')
      .select()
      .single();

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (deleteError) throw deleteError;

    res.status(200).json({ 
      completedTasks: stats.completed_tasks,
      task: task
    });
  } catch (error) {
    console.error('POST /complete error:', error);
    res.status(500).json({ error: 'Failed to complete task' });
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
    console.error('GET /stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
});