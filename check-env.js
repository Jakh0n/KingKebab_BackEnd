#!/usr/bin/env node
/**
 * Environment Variables Checker
 * Run this to verify your .env file is configured correctly
 * Usage: node check-env.js
 */

require('dotenv').config()

console.log('\n🔍 Checking Environment Variables...\n')

const requiredVars = [
	'TELEGRAM_BOT_TOKEN',
	'JWT_SECRET',
	'MONGODB_URI',
]

const optionalVars = [
	'TELEGRAM_MINI_APP_BOT_TOKEN',
	'TELEGRAM_ADMIN_CHAT_IDS',
	'MASTER_ADMIN_KEY',
	'PORT',
	'FRONTEND_URL',
]

let allGood = true

// Check required variables
console.log('📋 Required Variables:')
requiredVars.forEach(varName => {
	const value = process.env[varName]
	if (value) {
		// Mask sensitive values
		if (varName.includes('TOKEN') || varName.includes('SECRET') || varName.includes('URI')) {
			const masked = value.length > 10 
				? value.substring(0, 6) + '...' + value.substring(value.length - 4)
				: '***'
			console.log(`  ✅ ${varName}: ${masked}`)
			
			// Validate Telegram token format
			if (
				varName === 'TELEGRAM_BOT_TOKEN' ||
				varName === 'TELEGRAM_MINI_APP_BOT_TOKEN'
			) {
				if (!/^\d+:[A-Za-z0-9_-]+$/.test(value.trim())) {
					console.log(`     ⚠️  Warning: Token format looks invalid`)
					console.log(`     Expected format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
					allGood = false
				}
			}
		} else {
			console.log(`  ✅ ${varName}: ${value}`)
		}
	} else {
		console.log(`  ❌ ${varName}: NOT SET`)
		allGood = false
	}
})

// Check optional variables
console.log('\n📋 Optional Variables:')
optionalVars.forEach(varName => {
	const value = process.env[varName]
	if (value) {
		if (varName.includes('KEY') || varName.includes('SECRET')) {
			const masked = value.length > 10 
				? value.substring(0, 6) + '...' + value.substring(value.length - 4)
				: '***'
			console.log(`  ✅ ${varName}: ${masked}`)
		} else {
			console.log(`  ✅ ${varName}: ${value}`)
		}
	} else {
		console.log(`  ⚠️  ${varName}: Not set (optional)`)
	}
})

// Check admin chat IDs format
if (process.env.TELEGRAM_ADMIN_CHAT_IDS) {
	const chatIds = process.env.TELEGRAM_ADMIN_CHAT_IDS.split(',').map(id => id.trim()).filter(id => id)
	console.log(`\n📱 Admin Chat IDs: ${chatIds.length} configured`)
	chatIds.forEach((id, index) => {
		if (/^\d+$/.test(id)) {
			console.log(`  ✅ Chat ID ${index + 1}: ${id}`)
		} else {
			console.log(`  ❌ Chat ID ${index + 1}: Invalid format (should be numbers only)`)
			allGood = false
		}
	})
} else {
	console.log(`\n📱 Admin Chat IDs: Not configured (optional)`)
}

console.log('\n' + '='.repeat(50))
if (allGood) {
	console.log('✅ All required environment variables are set!')
	console.log('💡 If you still see warnings, make sure to restart your backend server.')
} else {
	console.log('❌ Some required environment variables are missing!')
	console.log('💡 Please check your .env file in the backend/ directory.')
}
console.log('='.repeat(50) + '\n')

