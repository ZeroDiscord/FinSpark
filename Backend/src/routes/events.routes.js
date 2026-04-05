'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/eventsController');

router.post('/', asyncHandler(controller.postEvents));
router.get('/', asyncHandler(controller.getEvents));

module.exports = router;
