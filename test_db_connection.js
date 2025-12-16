// Script pour tester la connexion et l'insertion dans Admin
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const dbConfig = require('./dbConfig');

console.log(' Test de connexion à la base de données...');
console.log('Configuration:', { ...dbConfig, password: '***' });

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
  if (err) {
    console.error(' Erreur de connexion:', err);
    process.exit(1);
  }
  
  console.log(' Connecté à MySQL');
  
  // Vérifier la structure de la table
  console.log('\n Structure de la table Admin:');
  db.query('DESCRIBE Admin', (err, results) => {
    if (err) {
      console.error(' Erreur DESCRIBE:', err);
      db.end();
      return;
    }
    
    results.forEach(col => {
      console.log(`   ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    // Tester l'insertion
    console.log('\n Test d\'insertion...');
    const testEmail = 'test' + Date.now() + '@example.com';
    const testPassword = 'test123';
    
    bcrypt.hash(testPassword, 10, (hashErr, hash) => {
      if (hashErr) {
        console.error(' Erreur de hash:', hashErr);
        db.end();
        return;
      }
      
      console.log('   Email:', testEmail);
      console.log('   Hash:', hash.substring(0, 50) + '...');
      
      db.query(
        'INSERT INTO Admin (admin_email, password) VALUES (?, ?)',
        [testEmail, hash],
        (insErr, result) => {
          if (insErr) {
            console.error('\n❌ ERREUR D\'INSERTION:');
            console.error('   Code:', insErr.code);
            console.error('   Message:', insErr.message);
            console.error('   SQL State:', insErr.sqlState);
            console.error('   SQL Message:', insErr.sqlMessage);
            console.error('\n   Erreur complète:', JSON.stringify(insErr, null, 2));
          } else {
            console.log('\n✅ Insertion réussie!');
            console.log('   ID inséré:', result.insertId);
            
            // Nettoyer
            db.query('DELETE FROM Admin WHERE admin_email = ?', [testEmail], () => {
              console.log('   Données de test supprimées');
            });
          }
          
          db.end();
        }
      );
    });
  });
});

