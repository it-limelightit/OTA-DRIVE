1. Start Docker Desktop and wait until it says Docker is running.
  2. Open PowerShell in the project folder:                                                                     
                                                                                                                
  cd D:\limelightit\OTA_DRIVE                                                                                   
                                                                                                                
  3. Create the environment file:                                                                               
                                                                                                                
  Copy-Item .env.example .env                                                                                   
                                                                                                                
  4. Start the complete project:                                                                                
                                                                                                                
  docker compose up --build                                                                                     
                                                                                                                
  5. Wait until all services start. Then open:                                                                  
                                                                                                                
  - Dashboard: http://localhost:5173                                                                            
  - Backend health: http://localhost:3000/health                                                                
  - MinIO console: http://localhost:9001                                                                        
                                                                                                                
  6. For MinIO, log in using the values in .env:                                                                
                                                                                                                
  Username: limelight-dev                                                                                       
  Password: change-me-minio                                                                                     
                                                                                                                
  Create a bucket named:                                                                                        
                                                                                                                
  firmware                                                                                                      
                                                                                                                
  To stop the project, press Ctrl + C, then run:                                                                
                                                                                                                
  docker compose down                                                                                           
                                                                                                                
  For development mode instead of Docker containers:                                                            
                                                                                                                
  docker compose up -d postgres minio mosquitto                                                                 
  npm.cmd run dev                                                                                               
                                                                                                                
  Then open http://localhost:5173.                                                                              
                                                                                                                
                                                                                                                
› Ask Codex to do anything                                                                                      
                                                                                                                
  gpt-5.6-terra medium · D:\limelightit\OTA_DRIVE
