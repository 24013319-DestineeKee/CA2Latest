// Required Modules
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();
const path = require('path');

// Set up file upload using multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'images')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });
// Connect to MySQL
const connection = mysql.createConnection({
    host: 'vo6yz1.h.filess.io',
    user: 'C207team3biggoalz_clothbite',
    password: '2d0741e4bf20b5cf8ebd61b75092b58691a1b342',
    database: 'C207team3biggoalz_clothbite',
    port:'61002'

});
connection.connect(err => {
  if (err) return console.error('MySQL Error:', err);
  console.log('Connected to MySQL');
});

// --------- Express / EJS ---------
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

// --------- Session / Flash ---------
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));
app.use(flash());

// --------- Middleware ---------(Ken)
function checkAuthenticated(req, res, next) {
  if (req.session.user) return next();
  req.flash('error', 'Please log in first.');
  res.redirect('/login');
}

function checkAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  req.flash('error', 'Admin only page.');
  res.redirect('/myGoals');
}

function validateRegistration(req, res, next) {
  const { username, email, password, address, contact, role } = req.body;
  const messages = [];
  if (!username || !email || !password || !address || !contact || !role) {
    messages.push('All fields are required.');
  }
  if (password && password.length > 0 && password.length < 6) {
    messages.push('Password must be at least 6 characters.');
  }
  if (messages.length) {
    req.flash('error', messages);
    req.flash('formData', req.body);
    return res.redirect('/register');
  }
  next();
}


// --------- Routes ---------

// Home (Ken)
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user });
});

// Register (Ken)
app.get('/register', (req, res) => {
  res.render('register', {
    messages: req.flash('error'),
    formData: req.flash('formData')[0]
  });
});

//Check email if is in database (Ken)
app.post('/register', validateRegistration, (req, res) => {
  const { username, email, password, address, contact, role } = req.body;

  const checkEmailSql = 'SELECT * FROM users WHERE email = ?';
  connection.query(checkEmailSql, [email], (err, results) => {
    if (err) throw err;

    if (results.length > 0) {
      req.flash('error', 'Email is already registered.');
      req.flash('formData', req.body); // So form keeps filled values
      return res.redirect('/register');
    }

    const insertSql = `
      INSERT INTO users (username, email, password, address, contact, role)
      VALUES (?, ?, SHA1(?), ?, ?, ?)
    `;
    connection.query(insertSql, [username, email, password, address, contact, role], err2 => {
      if (err2) throw err2;
      req.flash('success', 'Registered! Please log in.');
      res.redirect('/login');
    });
  });
});

// Login (Ken)
app.get('/login', (req, res) => {
  res.render('login', {
    error_msg: req.flash('error'),
    success_msg: req.flash('success')
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const messages = [];

  if (!email || !password) {
    messages.push('Email and password are required.');
  } else {
    if (!email.includes('@') || !email.includes('.')) {
      messages.push('Invalid email format.');
    }
    if (password.length < 6) {
      messages.push('Password must be at least 6 characters.');
    }
  }

  if (messages.length > 0) {
    req.flash('error', messages);
    return res.redirect('/login');
  }

  const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
  connection.query(sql, [email, password], (err, results) => {
    if (err) throw err;
    if (results.length) {
      req.session.user = results[0];
      req.flash('success', 'Login successful');
      return res.redirect(results[0].role === 'admin' ? '/admindashboard' : '/');
    }
    req.flash('error', 'Invalid email or password');
    res.redirect('/login');
  });
});


// Logout (Ken)
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});


// Admindashboard (Ken)
app.get('/admindashboard', (req, res) => {
  if (!req.session.user) {
    req.flash('error', 'Please login first');
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'admin') {
    req.flash('error', 'Access denied');
    return res.redirect('/dashboard');
  }
  res.render('admindashboard', { user: req.session.user });
});


//Manage all habit (Admin) (Ken)
app.get('/manageHabits', checkAuthenticated, checkAdmin, (req, res) => {
  const habitSql = `
    SELECT h.*, g.title AS goal_title, u.username
    FROM habit h
    JOIN goals g ON h.goal_id = g.goal_id
    JOIN users u ON g.users_id = u.users_id
    ORDER BY h.habit_id DESC
  `;

  const activitySql = `
    SELECT u.username,
           COUNT(DISTINCT g.goal_id) AS total_goals,
           COUNT(h.habit_id) AS total_habits
    FROM users u
    LEFT JOIN goals g ON u.users_id = g.users_id
    LEFT JOIN habit h ON g.goal_id = h.goal_id
    GROUP BY u.users_id
    ORDER BY total_habits DESC
  `;

  connection.query(habitSql, (err, habits) => {
    if (err) return res.status(500).send('Error loading habits');

    connection.query(activitySql, (err2, activity) => {
      if (err2) return res.status(500).send('Error loading user activity');

      res.render('managehabits', {
        user: req.session.user,
        habits,
        activity
      });
    });
  });
});

// Admin: view all goals (Ken)
app.get('/manageGoals', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = `
    SELECT g.*, u.username 
    FROM goals g 
    JOIN users u ON g.users_id = u.users_id
    ORDER BY g.goal_id DESC
  `;

  connection.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching goals:', err.message);
      return res.status(500).send('Server error');
    }
    res.render('manageGoals', { user: req.session.user, goals: results });
  });
});

//managerusers from admin : (Ken)
app.get('/manageUsers', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = 'SELECT users_id, username, email, role FROM users ORDER BY users_id';
  connection.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).send('Error loading user list');
    }
    res.render('manageusers', { user: req.session.user, users: results });
  });
});


//update role (admin only) (Ken)
app.post('/updateRole/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;

  const sql = 'UPDATE users SET role = ? WHERE users_id = ?';
  connection.query(sql, [role, userId], (err) => {
    if (err) {
      console.error('Error updating role:', err.message);
      return res.status(500).send('Failed to update role');
    }
    req.flash('success', 'User role updated successfully.');
    res.redirect('/manageUsers');
  });
});


//////////////////////////////////////////////////////////////////////////////////////////////

//deletegoal in managegoal (Admin)
app.post('/deleteGoal/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const goalId = req.params.id;
  const sql = 'DELETE FROM goals WHERE goal_id = ?';

  connection.query(sql, [goalId], (err) => {
    if (err) {
      console.error('Error deleting goal:', err.message);
      return res.status(500).send('Failed to delete goal');
    }
    res.redirect('/manageGoals');
  });
});



//deleteuser (Only admin can) 
app.post('/deleteUser/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const userId = req.params.id;

  const sql = 'DELETE FROM users WHERE users_id = ? AND role != "admin"';
  connection.query(sql, [userId], (err) => {
    if (err) {
      console.error('Error deleting user:', err);
      return res.status(500).send('Failed to delete user');
    }
    res.redirect('/manageUsers');
  });
});


// --------- GOALS ---------
// Add Goal (Des)
app.get('/addGoal', checkAuthenticated, (req, res) => {
  res.render('addGoal', { user: req.session.user, messages:req.flash('error'),formData:req.flash('formData'[0] ||{}) });
});

app.post('/addGoal', checkAuthenticated, upload.single('image'), (req, res) => {
  const { goalTitle, description, targetDate } = req.body;
  const image = req.file ? req.file.filename : null;
  const users_id = req.session.user?.users_id;

  const checkDuplicateSql = `
    SELECT * FROM goals
    WHERE users_id = ? AND title = ?
  `;

  connection.query(checkDuplicateSql, [users_id, goalTitle], (error, results) => {
    if (error) {
      console.error('Error checking for duplicate goal:', error);
      return res.status(500).send('Server error checking duplicate');
    }

    if (results.length > 0) {
      req.flash('error', `The goal title "${goalTitle}" already exists.`);
      req.flash('formData',req.body);
      return res.redirect('/addGoal');
    }

    const sql = `INSERT INTO goals (users_id, title, description, image, targetDate) VALUES (?,?,?,?,?)`;
    const params = [users_id, goalTitle, description, image, targetDate];

    // Only insert if no duplicate (Jin Heng)
    connection.query(sql, params, (err2) => {
      if (err2) {
        console.error('ADD GOAL ERROR:', err2);
        return res.status(500).send(err2.sqlMessage || err2.message);
      }
      res.redirect('/items');
    });
  });
});



// Edit Goal (Jin Heng)
app.get('/editGoal/:id',checkAuthenticated, (req, res) => {
  const goalId = req.params.id;
  const sql = 'SELECT * FROM goals WHERE goal_id = ?';
  //Fetch data from MySQL based on the product ID
  connection.query(sql, [goalId], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Error retrieving product by ID');
    }
    // Check if any goal with the given ID was found
    if (results.length >0 ) {
      //Render HTML page with the goal data
      res.render('editGoal', { goal: results[0],user:req.session.user });

    } else {
      // If no goal with the given ID was found, render a 404 page or handle it accordingly
      res.status(404).send('Goal not found');
    }
  });
});

app.post('/editGoal/:id', checkAuthenticated, upload.single('image'), (req, res) => {
  const goalId = req.params.id;
  const { title, description, targetDate, currentImage } = req.body; // include currentImage
  const image = req.file ? req.file.filename : currentImage; // Use new image if uploaded, else keep old

  const sql = `
    UPDATE goals
    SET title = ?, description = ?, targetDate = ?, image = ?
    WHERE goal_id = ?
  `;

  connection.query(sql, [title, description, targetDate, image, goalId], (error) => {
    if (error) {
      console.error("Error updating goal", error);
      return res.status(500).send('Error updating goal: ' + error.sqlMessage);
    }
    res.redirect('/manageGoals');
  });
});



// Delete Goal (Jeremy)
app.post('/deleteUser/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const userId = req.params.id;

  // First delete goals, then delete user
  const deleteGoalsSql = 'DELETE FROM goals WHERE users_id = ?';
  const deleteUserSql = 'DELETE FROM users WHERE users_id = ? AND role != "admin"';

  connection.query(deleteGoalsSql, [userId], (err1) => {
    if (err1) {
      console.error('Error deleting user goals:', err1.message);
      return res.status(500).send('Failed to delete user goals');
    }

    connection.query(deleteUserSql, [userId], (err2) => {
      if (err2) {
        console.error('Error deleting user:', err2.message);
        return res.status(500).send('Failed to delete user');
      }

      res.redirect('/manageUsers');
    });
  });
});

// Allow users to delete their own goals (non-admin)
app.post('/user/deleteGoal/:id', checkAuthenticated, (req, res) => {
  const goalId = req.params.id;
  const userId = req.session.user.users_id;

  const sql = 'DELETE FROM goals WHERE goal_id = ? AND users_id = ?';

  connection.query(sql, [goalId, userId], (err) => {
    if (err) {
      console.error('Error deleting user goal:', err.message);
      return res.status(500).send('Failed to delete goal');
    }
    res.redirect('/items');
  });
});



// --------- HABITS ---------

// View my habits
app.get('/myHabits', checkAuthenticated, (req, res) => {
  const users_id = req.session.user.users_id;
  const sql = `
    SELECT h.*
    FROM habit h
    JOIN goals g ON h.goal_id = g.goal_id
    WHERE g.users_id = ?
  `;
  connection.query(sql, [users_id], (err, results) => {
    if (err) throw err;
    res.render('myHabits', { user: req.session.user, habits: results });
  });
});

// Add Habit (show goals to choose) (Des)
app.get('/addHabit', checkAuthenticated, (req, res) => {
  const users_id = req.session.user.users_id;
  connection.query('SELECT goal_id, title FROM goals WHERE users_id = ?', [users_id], (err, goals) => {
    if (err) throw err;
    res.render('addHabit', { user: req.session.user, goals });
  });
});

// Edit Habit 
app.get('/editHabit/:id',checkAuthenticated, (req, res) => {
  const habitId = req.params.id;
  const users_id = req.session.user.users_id;

  const habitSql = `SELECT * FROM habit WHERE habit_id = ?`;
  const goalSql = `SELECT goal_id, title FROM goals WHERE users_id = ?`;

  connection.query(habitSql,[habitId],(error,habitResults) =>{
    if(error){
      console.error('Error fetching habit:',error);
      return res.status(500).send('Failed to load habit');
    }

    if (habitResults.length ===0) {
      return res.status(404).send('Habit not found');
    }

    const habit = habitResults[0];

    connection.query(goalSql,[users_id],(error2,goals)=>{
      if (error2){
        console.error('Error fetching user goals:',error2);
        return res.status(500).send('Failed to load goals');
      }

      res.render('editHabit',{
        user:req.session.user,habit,goals
      });
    });
  });
});

// Handle POST
// POST /addHabit  (multipart but no files) (Des)
app.post('/addHabit', checkAuthenticated, upload.none(), (req, res) => {
  const { goal_id, name, frequency, targetDate } = req.body;

  if (!goal_id || !name || !frequency) {
    return res.status(400).send('Missing required fields');
  }

  const sql = `
    INSERT INTO habit (goal_id, name, frequency, targetDate)
    VALUES (?,?,?,?)
  `;
  connection.query(sql, [goal_id, name, frequency, targetDate || null], err => {
    if (err) {
      console.error('ADD HABIT ERR:', err);
      return res.status(500).send(err.sqlMessage || 'Error adding habit');
    }
    res.redirect('/items');
  });
});

// POST /editHabit
app.post('/editHabit/:id', checkAuthenticated, upload.none(), (req, res) => {
  const habitId = req.params.id;
  const { goal_id, name, frequency, targetDate } = req.body;
  console.log("req.body",req.body);

  const safeStart = start_date || null;
  const safeEnd = end_date || null;

  const updateSql = `
    UPDATE habit
    SET goal_id = ?, name = ?, frequency = ?, targetDate = ?
    WHERE habit_id = ?
  `;

  connection.query(updateSql, [goal_id, name, frequency, safeStart, safeEnd, habitId], (error) => {
    if (error) {
      console.error('Error updating habit:', error);
      return res.status(500).send('Failed to update habit');
    }

    //  Redirect based on user role
    if (req.session.user.role === 'admin') {
      res.redirect('/manageHabits');
    } else {
      res.redirect('/items');
    }
  });
});

app.get('/editHabituser/:id',checkAuthenticated, (req, res) => {
  const habitId = req.params.id;
  const users_id = req.session.user.users_id;

  const habitSql = `SELECT * FROM habit WHERE habit_id = ?`;
  const goalSql = `SELECT goal_id, title FROM goals WHERE users_id = ?`;

  connection.query(habitSql,[habitId],(error,habitResults) =>{
    if(error){
      console.error('Error fetching habit:',error);
      return res.status(500).send('Failed to load habit');
    }

    if (habitResults.length ===0) {
      return res.status(404).send('Habit not found');
    }

    const habit = habitResults[0];

    connection.query(goalSql,[users_id],(error2,goals)=>{
      if (error2){
        console.error('Error fetching user goals:',error2);
        return res.status(500).send('Failed to load goals');
      }

      res.render('editHabituser',{
        user:req.session.user,habit,goals
      });
    });
  });
});

//post//editHabit
app.post('/editHabituser/:id', checkAuthenticated, upload.none(), (req, res) => {
  const habitId = req.params.id;
  const { goal_id, name, frequency, targetDate } = req.body;
  console.log("req.body",req.body);

  const updateSql = `
    UPDATE habit
    SET goal_id = ?, name = ?, frequency = ?, targetDate = ?
    WHERE habit_id = ?
  `;

  connection.query(updateSql, [goal_id, name, frequency, targetDate, habitId], (error) => {
    if (error) {
      console.error('Error updating habit:', error);
      return res.status(500).send('Failed to update habit');
    }

    //  Redirect based on user role
    res.redirect('/items');
  });
});


app.get('/items', checkAuthenticated, (req, res) => {
  const users_id = req.session.user.users_id;

  const goalsSql = `
    SELECT g.goal_id, g.title, g.description, g.image, g.targetDate
    FROM goals g
    WHERE g.users_id = ?
    ORDER BY g.goal_id DESC
  `;

  const habitsSql = `
    SELECT h.*, g.title AS goal_title
    FROM habit h
    JOIN goals g ON h.goal_id = g.goal_id
    WHERE g.users_id = ?
    ORDER BY h.habit_id DESC
  `;

  connection.query(goalsSql, [users_id], (err, goals) => {
    if (err) throw err;
    connection.query(habitsSql, [users_id], (err2, habits) => {
      if (err2) throw err2;
        res.render('items', { user: req.session.user, goals, habits });
      });
    });
  });

// Delete Habit
app.post('/deletehabit/:id', checkAuthenticated, (req, res) => {
  const sql = 'DELETE FROM habit WHERE habit_id = ?';
  connection.query(sql, [req.params.id], err => {
    if (err) return res.status(500).send('Error deleting habit');
    
    // ✅ Redirect differently for admin and user
    if (req.session.user.role === 'admin') {
      res.redirect('/manageHabits');
    } else {
      res.redirect('/items');
    }
  });
});

//Search & Filter Function for Goals
app.get('/searchGoals', checkAuthenticated, (req, res) => {
  const users_id = req.session.user.users_id;
  const keyword = req.query.keyword || '';
  const filter = req.query.filter || '';

  let sql = `
    SELECT * FROM goals
    WHERE users_id = ?
      AND (title LIKE ? OR description LIKE ?)
  `;
  const params = [users_id, `%${keyword}%`, `%${keyword}%`];

  if (filter === 'today') {
    sql += ' AND DATE(created_at) = CURDATE()';
  } else if (filter === 'thisWeek') {
    sql += ' AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)';
  } else if (filter === 'hasImage') {
    sql += ' AND image IS NOT NULL AND image != ""';
  }

  connection.query(sql, params, (err, results) => {
    if (err) {
      console.error('Search error:', err);
      return res.status(500).send('Server error while searching.');
    }
    res.render('searchGoals', {
      user: req.session.user,
      goals: results,
      keyword,
      filter
    });
  });
});

//Search & Filter for Habits
app.get('/searchHabits', checkAuthenticated, (req, res) => {
  const users_id = req.session.user.users_id;
  const keyword = req.query.keyword || '';
  const goalFilter = req.query.goal || '';

  let sql = `
    SELECT h.*, g.title AS goal_title
    FROM habit h
    JOIN goals g ON h.goal_id = g.goal_id
    WHERE g.users_id = ?
      AND (h.name LIKE ? OR h.frequency LIKE ?)
  `;
  const params = [users_id, `%${keyword}%`, `%${keyword}%`];

  if (goalFilter) {
    sql += ' AND g.title = ?';
    params.push(goalFilter);
  }

  // Get all user's goal titles for filter dropdown
  const goalSql = `SELECT DISTINCT title FROM goals WHERE users_id = ?`;

  connection.query(sql, params, (err, habits) => {
    if (err) {
      console.error('Habit search error:', err);
      return res.status(500).send('Server error while searching habits.');
    }

    connection.query(goalSql, [users_id], (err2, goalList) => {
      if (err2) {
        console.error('Goal filter fetch error:', err2);
        return res.status(500).send('Server error loading goal filters.');
      }

      res.render('searchHabits', {
        user: req.session.user,
        habits,
        goalList,
        keyword,
        goalFilter
      });
    });
  });
});
// Edit Goaluser
app.get('/editGoaluser/:id',checkAuthenticated, (req, res) => {
  const goalId = req.params.id;
  const sql = 'SELECT * FROM goals WHERE goal_id = ?';
  //Fetch data from MySQL based on the product ID
  connection.query(sql, [goalId], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Error retrieving product by ID');
    }
    // Check if any goal with the given ID was found
    if (results.length >0 ) {
      //Render HTML page with the goal data
      res.render('editGoaluser', { goal: results[0],user:req.session.user });
    } else {
      // If no goal with the given ID was found, render a 404 page or handle it accordingly
      res.status(404).send('Goal not found');
    }
  });
});

app.post('/editGoaluser/:id', checkAuthenticated, upload.single('image'), (req, res) => {
  const goalId = req.params.id;
  const { title, description, targetDate, currentImage } = req.body;
  const image = req.file ? req.file.filename : currentImage;

  const sql = `
    UPDATE goals
    SET title = ?, description = ?, targetDate = ?, image = ?
    WHERE goal_id = ?
  `;

  connection.query(sql, [title, description, targetDate, image, goalId], (error) => {
    if (error) {
      console.error("Error updating goal", error);
      return res.status(500).send('Error updating goal: ' + error.sqlMessage);
    }

    //  Redirect to /items after update (same for user/admin)
    res.redirect('/items');
  });
});



// --------- Server ---------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));
