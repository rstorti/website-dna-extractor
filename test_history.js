require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkHistory() {
  const { data, error } = await supabase
    .from('extraction_history')
    .select('id, url, timestamp')
    .limit(5);

  if (error) {
    console.error("Supabase Error:", error);
  } else {
    console.log("History records in DB:", data);
  }
}
checkHistory();
