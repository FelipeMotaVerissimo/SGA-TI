const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
require('dotenv').config();

const authRoutes         = require('./routes/authRoutes');
const clienteRoutes      = require('./routes/clienteRoutes');
const equipamentoRoutes  = require('./routes/equipamentoRoutes');
const ordemServicoRoutes = require('./routes/ordemServicoRoutes');
const produtoRoutes      = require('./routes/produtoRoutes');
const usuarioRoutes      = require('./routes/usuarioRoutes');
const errorHandler       = require('./middlewares/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/auth',         authRoutes);
app.use('/api/clientes',     clienteRoutes);
app.use('/api/equipamentos', equipamentoRoutes);
app.use('/api/ordens',       ordemServicoRoutes);
app.use('/api/produtos',     produtoRoutes);
app.use('/api/usuarios',     usuarioRoutes);

app.use(errorHandler);

module.exports = app;