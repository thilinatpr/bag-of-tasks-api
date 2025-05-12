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
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    db: 'connected',
    timestamp: new Date().toISOString()
  });
});

// Get all tasks - now returns duration in seconds
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

// Add new task - converts minutes to seconds
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, duration, tags = ['general'] } = req.body;
    
    if (!title || duration === undefined) {
      return res.status(400).json({ error: 'Title and duration are required' });
    }

    // Convert decimal minutes to seconds
    const durationInSeconds = Math.round(parseFloat(duration) * 60);

    const { data, error } = await supabase
      .from('tasks')
      .insert([{ 
        title, 
        duration: durationInSeconds, // Store as seconds
        tags 
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('POST /tasks error:', error);
    res.status(500).json({ error: 'Failed to add task' });
  }
});

// Complete task - no changes needed
app.post('/api/tasks/complete', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: 'Task ID required' });

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return res.status(404).json({ error: 'Task not found' });
    }

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

// Get stats - no changes needed
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