// Quick test to check if SMTP is configured properly
const projectRef = 'seeaalajmchrtblbhvwq';

console.log('Testing SMTP configuration for project:', projectRef);
console.log('\nTo check your SMTP configuration:');
console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/settings/auth');
console.log('2. Scroll down to "SMTP Settings"');
console.log('3. Ensure "Enable Custom SMTP" is turned ON');
console.log('4. Check that all SMTP fields are filled:');
console.log('   - Sender email');
console.log('   - Sender name');
console.log('   - Host');
console.log('   - Port (usually 587 or 465)');
console.log('   - Username');
console.log('   - Password');
console.log('\n5. After enabling, also check Rate Limits:');
console.log('   https://supabase.com/dashboard/project/' + projectRef + '/auth/rate-limits');
console.log('   - Increase "Email rate limit" from default 30/hour to higher value');
console.log('\nIMPORTANT: After changing SMTP settings, it may take a few minutes to take effect.');