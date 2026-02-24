import PyInstaller.__main__
import os

# Get absolute path to the frontend folder
frontend_dir = os.path.abspath('frontend')

PyInstaller.__main__.run([
    'desktop_launcher.py',
    '--name=OpticalLinkCalculator',
    '--windowed',
    '--onefile',
    f'--add-data={frontend_dir}:frontend',
    '--clean'
])
