# Wild Africa — GitHub Pages Edition

Prepared as a static website for **GitHub Pages**. No backend is required.

## Publish from your phone or computer
1. Download and extract this ZIP.
2. Create a repository on GitHub, for example `wild-africa`.
3. In the repository, choose **Add file → Upload files**.
4. Upload the *contents* of this folder. Ensure `index.html`, `style.css`, and `game.js` are directly at the repository top level, not inside a nested folder.
5. Commit to the `main` branch.
6. Open **Settings → Pages**.
7. Under **Build and deployment**, choose **Deploy from a branch**.
8. Select branch `main` and folder `/(root)`, then choose **Save**.
9. Wait for publishing, then open the address shown by GitHub Pages. For a repository named `wild-africa`, it normally looks like `https://YOUR-USERNAME.github.io/wild-africa/`.

## Important
- Three.js is loaded from jsDelivr, so the device needs internet access.
- Keep filenames exactly as supplied; GitHub Pages is case-sensitive.
- This project uses relative local file references and works when published at a repository subpath such as `/wild-africa/`.
- If the page is blank, check that all main files are at the repository root and that the device is online.

## Included features
Third-person movement, mobile joystick, touch camera, jump, sprint, crouch, wildlife behavior, damage/health, survival meters, resources, inventory, missions, rewards, checkpoints, mini-map, day/night lighting and local browser saving.
