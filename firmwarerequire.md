Our backend currently expects the ESP32 firmware to implement the following contract.
                                                                                                    
  ### 1. Device status message                                                                      
                                                                                                    
  The firmware should publish on boot, reconnect, and periodically:                                 
                                                                                                    
  devices/{device_id}/status                                                                        
                                                                                                    
  Example:                                                                                          
                                                                                                    
  {                                                                                                 
    "msg_type": "device.status",                                                                    
    "device_id": "IR000123",                                                                        
    "product": "SMART_IR",                                                                          
    "hw": "HW2",                                                                                    
    "fw": "1.4.2",                                                                                  
    "battery_mv": 3710,                                                                             
    "boot_id": "boot-123",                                                                          
    "message_id": "msg-001"                                                                         
  }                                                                                                 
                                                                                                    
  Required fields:                                                                                  
                                                                                                    
  msg_type                                                                                          
  device_id                                                                                         
  product                                                                                           
  hw                                                                                                
  fw                                                                                                
                                                                                                    
  Optional fields:                                                                                  
                                                                                                    
  battery_mv                                                                                        
  boot_id                                                                                           
  message_id                                                                                        
                                                                                                    
  The device_id in the topic and JSON must be identical.                                            
                                                                                                    
  ### 2. OTA command subscription                                                                   
                                                                                                    
  The firmware should subscribe to:                                                                 
                                                                                                    
  devices/{device_id}/command                                                                       
                                                                                                    
  Example command from backend:                                                                     
                                                                                                    
  {                                                                                                 
    "msg_type": "ota.start",                                                                        
    "command_id": "uuid",                                                                           
    "deployment_id": "uuid",
    "version": "1.5.0",
    "url": "https://storage.example.com/signed-firmware-url",                                       
    "size": 2097152,                                                                                
    "sha256": "64-character-hash"                                                                   
  }                                                                                                 
                                                                                                    
  The firmware must:                                                                                
                                                                                                    
  - Confirm the command is for that device.                                                         
  - Check product and hardware compatibility.                                                       
  - Reject duplicate command_id values.                                                             
  - Check whether downgrade is allowed.                                                             
  - Download the firmware using HTTPS.                                                              
  - Verify file size.                                                                               
  - Calculate SHA-256.                                                                              
  - Compare it with the supplied SHA-256.                                                           
  - Write to the inactive OTA partition.                                                            
  - Reboot only after validation succeeds.                                                          
                                                                                                    
  ### 3. OTA status messages                                                                        
                                                                                                    
  The firmware should publish to:                                                                   
                                                                                                    
  devices/{device_id}/ota/status                                                                    
                                                                                                    
  Example:                                                                                          
                                                                                                    
  {                                                                                                 
    "msg_type": "ota.status",                                                                       
    "device_id": "IR000123",                                                                        
    "deployment_id": "uuid",                                                                        
    "status": "DOWNLOADING",                                                                        
    "progress_percent": 40,                                                                         
    "message_id": "ota-msg-001"                                                                     
  }                                                                                                 
                                                                                                    
  Allowed status values currently supported:                                                        
                                                                                                    
  WAITING                                                                                           
  STARTED                                                                                           
  DOWNLOADING                                                                                       
  INSTALLING                                                                                        
  REBOOTING                                                                                         
  SUCCESS                                                                                           
  FAILED                                                                                            
  ROLLED_BACK                                                                                       
                                                                                                    
  For success:                                                                                      
                                                                                                    
  {                                                                                                 
    "msg_type": "ota.status",                                                                       
    "device_id": "IR000123",                                                                        
    "deployment_id": "uuid",                                                                        
    "status": "SUCCESS",                                                                            
    "current_version": "1.5.0",                                                                     
    "progress_percent": 100,                                                                        
    "message_id": "ota-success-001"                                                                 
  }                                                                                                 
                                                                                                    
  For failure:                                                                                      
                                                                                                    
  {                                                                                                 
    "msg_type": "ota.status",                                                                       
    "device_id": "IR000123",                                                                        
    "deployment_id": "uuid",                                                                        
    "status": "FAILED",                                                                             
    "error_code": "OTA_HASH_MISMATCH",                                                              
    "message_id": "ota-failed-001"                                                                  
  }                                                                                                 
                                                                                                    
  ### What is still remaining in firmware                                                           
                                                                                                    
  The repository does not contain ESP32 firmware, so these items still need to be implemented and   
  tested by the firmware team:                                                                      
                                                                                                    
  - Confirm the existing device ID format.                                                          
  - Confirm the existing MQTT broker topics.                                                        
  - Confirm the current device status payload.                                                      
  - Add or verify status publishing.                                                                
  - Add command-topic subscription.                                                                 
  - Add OTA command parsing.                                                                        
  - Add HTTPS firmware download.                                                                    
  - Add SHA-256 verification.                                                                       
  - Add firmware signature verification.                                                            
  - Add inactive OTA partition installation.                                                        
  - Add reboot handling.                                                                            
  - Add post-boot health validation.                                                                
  - Add rollback handling.                                                                          
  - Add OTA progress reporting.                                                                     
  - Add final success/failure reporting.                                                            
  - Add duplicate-command protection.                                                               
  - Add downgrade/anti-rollback policy.                                                             
  - Add MQTT reconnect behavior.                                                                    
  - Add device credentials and TLS support.                                                         
                                                                                                    
  The first thing to do with the firmware team is inspect the existing broker using MQTT Explorer:  
                                                                                                    
  devices/#                                                                                         
                                                                                                    
  Then record the actual topics and payloads already being published. If they differ from the       
  contract above, we should adapt the backend to the existing firmware rather than changing device  
  behavior blindly.   