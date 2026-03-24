#include <Adafruit_NeoPixel.h>
#include <TinyGPS++.h>
#include <ESP32Servo.h>

#define ENA 25
#define IN1 26
#define IN2 27
#define ENB 12
#define IN3 14
#define IN4 32
#define PIN_SERVO 13
#define PIN_LEDS  4
#define NUM_LEDS  14

// WS2811 : Essayer NEO_BRG si les couleurs sont inversées
Adafruit_NeoPixel pixels(NUM_LEDS, PIN_LEDS, NEO_BRG + NEO_KHZ800);
TinyGPSPlus gps;
Servo camServo;
HardwareSerial SerialGPS(2); 

int currentBlinker = 0; 
unsigned long lastGps = 0;

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(5); // Très important pour la réactivité
  SerialGPS.begin(9600, SERIAL_8N1, 16, 17);
  
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  
  camServo.attach(PIN_SERVO);
  pixels.begin();
  pixels.setBrightness(150);
  pixels.show();
}

void loop() {
  while (SerialGPS.available() > 0) gps.encode(SerialGPS.read());

  // Envoi Heartbeat + GPS
  if (millis() - lastGps > 1000) {
    if (gps.location.isValid()) {
      Serial.print("GPS:"); Serial.print(gps.location.lat(), 6);
      Serial.print(","); Serial.println(gps.location.lng(), 6);
    } else {
      Serial.println("ALIVE"); 
    }
    lastGps = millis();
  }

  // LECTURE COMMANDE AVEC ANTI-LATENCE
  if (Serial.available() > 0) {
    if (Serial.available() > 16) { 
      while (Serial.available() > 8) { Serial.read(); } 
    }
    String cmd = Serial.readStringUntil('\n');
    parseCommand(cmd);
  }
  updateLEDs();
}

void parseCommand(String cmd) {
  int f = cmd.indexOf(','), s = cmd.indexOf(',', f + 1);
  if (f != -1 && s != -1) {
    int v = cmd.substring(0, f).toInt();
    int b = cmd.substring(f + 1, s).toInt();
    int d = cmd.substring(s + 1).toInt();

    controlMotor(v + (d/2), ENA, IN1, IN2);
    controlMotor(v - (d/2), ENB, IN3, IN4);
    camServo.write(map(d, -255, 255, 135, 45));
    currentBlinker = b;
  }
}

void controlMotor(int spd, int p_pwm, int p_i1, int p_i2) {
  int s = constrain(abs(spd), 0, 255);
  digitalWrite(p_i1, spd > 20);
  digitalWrite(p_i2, spd < -20);
  analogWrite(p_pwm, s);
}

void updateLEDs() {
  static unsigned long lastB = 0;
  static bool flash = false;
  if (millis() - lastB < 300) return;
  lastB = millis(); flash = !flash;

  uint32_t RED = pixels.Color(255, 0, 0);
  uint32_t ORANGE = pixels.Color(255, 30, 0); 
  uint32_t WHITE = pixels.Color(255, 255, 255);
  uint32_t OFF = pixels.Color(0, 0, 0);

  for(int i=0; i<14; i++) {
    if (i == 6 || i == 7) pixels.setPixelColor(i, WHITE);
    else pixels.setPixelColor(i, RED);
  }

  if (currentBlinker == 1 || currentBlinker == 3) {
    for(int i=0; i<6; i++) pixels.setPixelColor(i, flash ? ORANGE : OFF);
  }
  if (currentBlinker == 2 || currentBlinker == 3) {
    for(int i=8; i<14; i++) pixels.setPixelColor(i, flash ? ORANGE : OFF);
  }
  pixels.show();
}